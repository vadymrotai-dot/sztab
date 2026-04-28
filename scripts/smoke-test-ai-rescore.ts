// scripts/smoke-test-ai-rescore.ts
// Sprint G / Commit 7 — end-to-end smoke test для AI re-score pipeline.
//
// Picks 3 diverse products + runs rescoreTop20() для кожного, then prints
// BEFORE (algo only) vs AFTER (combined) ranking з AI reasoning.
//
// Acceptance criteria check:
//   - AI score variance > 10 (не всі однакові)
//   - Reasoning є валідним польським (heuristic check на PL чарактers)
//   - В принаймні одного product ranking re-ordered (top != by-algo top)

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'
import { rescoreTop20 } from '@/lib/matching/ai-rescore'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

interface MatchSnap {
  id: string
  algo_score: number
  ai_score: number | null
  ai_reasoning: string | null
  ai_confidence: number | null
  client_id: string | null
  prospect_id: string | null
}

function isPolishText(s: string): boolean {
  if (!s || s.length < 5) return false
  // Heuristic: non-empty, has ASCII letters, no obvious mojibake (\\x or \\u)
  if (/\\x[0-9a-f]{2}|\\u[0-9a-f]{4}/i.test(s)) return false
  if (!/[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]{3,}/.test(s)) return false
  return true
}

async function main() {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!svcKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing')
    process.exit(1)
  }
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY missing')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('\n══════ Sprint G — AI Re-Score Smoke Test ══════\n')

  // ─── Pick 3 products ───
  // (a) Kiszonki (vegetable/sour pickles, niche food)
  const { data: kiszonki } = await supabase
    .from('products')
    .select('id, name, brand, category')
    .or('name.ilike.%kapusta%,name.ilike.%ogórk%,name.ilike.%burak%')
    .not('family_id', 'is', null)
    .limit(1)

  // (b) Sałatki gotowe — broader fit
  const { data: salatki } = await supabase
    .from('products')
    .select('id, name, brand, category')
    .or('category.eq.salatki_gotowe,category.eq.salatka_baklazan,category.eq.surowka_marchew')
    .not('family_id', 'is', null)
    .limit(1)

  // (c) Random additional — pick by ord, не overlap
  const { data: anyOther } = await supabase
    .from('products')
    .select('id, name, brand, category')
    .not('family_id', 'is', null)
    .order('lp', { ascending: true })
    .limit(5)

  const pick1 = (kiszonki?.[0] as { id: string; name: string; brand: string | null; category: string | null } | undefined) ?? null
  const pick2 = (salatki?.[0] as { id: string; name: string; brand: string | null; category: string | null } | undefined) ?? null
  const others = (anyOther ?? []) as Array<{ id: string; name: string; brand: string | null; category: string | null }>
  const pick3 =
    others.find((o) => o.id !== pick1?.id && o.id !== pick2?.id) ?? null

  const products = [pick1, pick2, pick3].filter(Boolean) as Array<{
    id: string
    name: string
    brand: string | null
    category: string | null
  }>

  if (products.length === 0) {
    console.error('❌ No products with family_id found')
    process.exit(1)
  }

  // ─── Snapshot BEFORE ───
  async function snapshot(productId: string): Promise<MatchSnap[]> {
    const { data } = await supabase
      .from('matches')
      .select('id, algo_score, ai_score, ai_reasoning, ai_confidence, client_id, prospect_id')
      .eq('product_id', productId)
      .order('algo_score', { ascending: false })
      .limit(20)
    return (data ?? []) as MatchSnap[]
  }

  // ─── For each product: snap before + rescore + snap after + compare ───
  const productResults: Array<{
    name: string
    before: MatchSnap[]
    after: MatchSnap[]
    cost: number
    duration_ms: number
    error?: string
    variance: number
    pl_valid: boolean
    reranked: boolean
  }> = []

  for (const p of products) {
    console.log(`\n[${p.name}] ${p.id}`)
    console.log(`  Category: ${p.category ?? '?'}, brand: ${p.brand ?? '?'}`)

    const before = await snapshot(p.id)
    if (before.length === 0) {
      console.log('  ⚠️ No matches — skipping')
      productResults.push({
        name: p.name,
        before: [],
        after: [],
        cost: 0,
        duration_ms: 0,
        variance: 0,
        pl_valid: false,
        reranked: false,
      })
      continue
    }

    console.log(`  TOP-20 BEFORE: max=${before[0]?.algo_score}, ` +
      `min=${before[before.length - 1]?.algo_score}, distinct=${new Set(before.map((m) => m.algo_score)).size}`)

    console.log('  Running rescoreTop20...')
    const r = await rescoreTop20(supabase, apiKey, p.id)
    console.log(`  → ${r.rescored_count}/${r.candidates_count} rescored, ` +
      `cost ~$${r.cost_usd.toFixed(4)}, duration ${r.duration_ms}ms`)
    if (r.error) console.log(`  ❌ Error: ${r.error}`)

    const after = await snapshot(p.id)
    after.sort((a, b) => (b.ai_score ?? b.algo_score) - (a.ai_score ?? a.algo_score))

    // Acceptance metrics
    const aiScores = after
      .map((m) => m.ai_score)
      .filter((x): x is number => x !== null)
    const variance = aiScores.length > 0 ? Math.max(...aiScores) - Math.min(...aiScores) : 0
    const reasoningArr = after
      .map((m) => m.ai_reasoning)
      .filter((x): x is string => Boolean(x))
    const plValid = reasoningArr.length > 0 && reasoningArr.every(isPolishText)
    const beforeTop3 = before.slice(0, 3).map((m) => m.id)
    const afterTop3 = after.slice(0, 3).map((m) => m.id)
    const reranked = beforeTop3.join(',') !== afterTop3.join(',')

    productResults.push({
      name: p.name,
      before,
      after,
      cost: r.cost_usd,
      duration_ms: r.duration_ms,
      error: r.error,
      variance,
      pl_valid: plValid,
      reranked,
    })

    // Print top-5 BEFORE vs AFTER
    console.log(`\n  TOP-5 BEFORE (algo):                   TOP-5 AFTER (combined):`)
    for (let i = 0; i < 5; i++) {
      const b = before[i]
      const a = after[i]
      const bStr = b ? `[${i + 1}] ${b.algo_score}` : '—'
      const aStr = a
        ? `[${i + 1}] ${a.ai_score ?? a.algo_score}${a.ai_score !== null ? ` (algo ${a.algo_score})` : ''}`
        : '—'
      console.log(`     ${bStr.padEnd(35)} ${aStr}`)
      if (a?.ai_reasoning) {
        console.log(`        🤖 ${a.ai_reasoning.slice(0, 100)}`)
      }
    }
  }

  // ─── Summary ───
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('AI RE-SCORE SMOKE TEST RESULT')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  let totalCost = 0
  for (const r of productResults) {
    console.log(`\n  ${r.name}:`)
    if (r.error) {
      console.log(`    ❌ ${r.error}`)
      continue
    }
    console.log(`    cost:           $${r.cost.toFixed(4)}`)
    console.log(`    duration:       ${(r.duration_ms / 1000).toFixed(1)}s`)
    console.log(`    AI variance:    ${r.variance} ${r.variance > 10 ? '✅' : '⚠️ <10'}`)
    console.log(`    PL valid:       ${r.pl_valid ? '✅' : '❌'}`)
    console.log(`    Reranked top-3: ${r.reranked ? '✅ yes' : '⚠️ no (algo top stable)'}`)
    totalCost += r.cost
  }
  console.log(`\n  Total cost:       $${totalCost.toFixed(4)}`)

  // Final acceptance summary
  const allPlValid = productResults.every((r) => r.error || r.pl_valid)
  const anyVariance = productResults.some((r) => r.variance > 10)
  const anyReranked = productResults.some((r) => r.reranked)
  console.log('\n  Acceptance:')
  console.log(`    Variance >10 (any product): ${anyVariance ? '✅' : '❌'}`)
  console.log(`    PL reasoning valid:         ${allPlValid ? '✅' : '❌'}`)
  console.log(`    Re-ranking occurred (any):  ${anyReranked ? '✅' : '⚠️ unexpected'}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // DB-wide check
  const { count: aiTotal } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .not('ai_score', 'is', null)
  console.log(`\nDB matches з ai_score: ${aiTotal ?? '?'}`)
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
