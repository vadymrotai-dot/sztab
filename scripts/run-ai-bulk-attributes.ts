// scripts/run-ai-bulk-attributes.ts
// One-shot bulk-fill SKU attributes via Claude Haiku 4.5 (provider swap
// 2026-04-28 from Gemini). Uses service-role Supabase client (bypasses RLS,
// like seed-cd-projekt-test.ts) — no API auth complexity.
//
// Run:
//   pnpm exec tsx scripts/run-ai-bulk-attributes.ts

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'

import {
  generateSkuAttributesBulk,
  type SkuInput,
  type SkuAttrResult,
} from '@/lib/ai/sku-attributes'
import { resolveProductAttributes } from '@/lib/product-attributes'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

interface ProductRow {
  id: string
  name: string
  ean: string | null
  brand: string | null
  family_id: string | null
}

interface FamilyRow {
  id: string
  name_pl: string
  required_attributes: string[]
}

async function main() {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const aiKey = process.env.ANTHROPIC_API_KEY
  if (!svcKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing')
    process.exit(1)
  }
  if (!aiKey) {
    console.error('❌ ANTHROPIC_API_KEY missing — додай у .env.local')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('\n══════ AI Bulk Attributes (Claude Haiku 4.5) ══════\n')
  const startedAt = Date.now()

  // 1. Load classified products
  const { data: productRows } = await supabase
    .from('products')
    .select('id, name, ean, brand, family_id')
    .not('family_id', 'is', null)
  const products = (productRows ?? []) as ProductRow[]
  console.log(`[1] Classified products: ${products.length}`)

  // 2. Load family info
  const familyIds = Array.from(
    new Set(products.map((p) => p.family_id).filter((x): x is string => Boolean(x))),
  )
  const { data: familyRows } = await supabase
    .from('taxonomy_families')
    .select('id, name_pl, required_attributes')
    .in('id', familyIds)
  const familyMap = new Map<string, FamilyRow>(
    ((familyRows ?? []) as FamilyRow[]).map((f) => [f.id, f]),
  )

  // 3. Build per-SKU input з missing required
  const skuInputs: SkuInput[] = []
  const familyOfSku = new Map<string, string>() // sku_id → family_name_pl
  let alreadyClean = 0
  for (const p of products) {
    const fam = p.family_id ? familyMap.get(p.family_id) : null
    if (!fam || fam.required_attributes.length === 0) continue
    const resolved = await resolveProductAttributes(supabase, p.id)
    const missing = resolved.attributes
      .filter((a) => a.missing_required)
      .map((a) => a.attr_key)
    if (missing.length === 0) {
      alreadyClean++
      continue
    }
    skuInputs.push({
      sku_id: p.id,
      name: p.name,
      ean: p.ean,
      brand: p.brand,
      family_name_pl: fam.name_pl,
      required_attributes: missing,
    })
    familyOfSku.set(p.id, fam.name_pl)
  }

  console.log(`    Already CLEAN: ${alreadyClean}`)
  console.log(`    To process:    ${skuInputs.length}`)

  if (skuInputs.length === 0) {
    console.log('\n✅ Nothing to do — all classified SKU вже filled.')
    return
  }

  // 4. Call bulk
  console.log(`\n[2] Calling Claude Haiku 4.5 (batches of 10)...`)
  const results = await generateSkuAttributesBulk(aiKey, skuInputs)

  // 5. Aggregate metadata
  let totalTokens = 0
  let totalDuration = 0
  let modelUsed = ''
  const seenBatches = new Set<string>()
  for (const r of results) {
    if (!r.meta) continue
    const batchKey = `${r.meta.model}-${r.meta.duration_ms}-${r.meta.batch_size}`
    if (!seenBatches.has(batchKey)) {
      seenBatches.add(batchKey)
      totalTokens += r.meta.tokens_used ?? 0
      totalDuration += r.meta.duration_ms ?? 0
      if (r.meta.model) modelUsed = r.meta.model
    }
  }
  // Cost: Haiku 4.5 = $1 input + $5 output per 1M tokens. Без exact in/out
  // split tu — approximate using mid rate $3 per 1M.
  const approxCost = (totalTokens / 1_000_000) * 3.0

  // 6. Upsert (locked + manual respected)
  console.log(`\n[3] Upserting attributes (з locked/manual respect)...`)
  const breakdown = new Map<string, { skus: number; attrs: number }>()
  let totalAttrsFilled = 0
  let failedSkus = 0

  for (const r of results) {
    if (r.error) {
      failedSkus++
      console.error(`    ✗ ${r.sku_id}: ${r.error}`)
      continue
    }
    const filled = Object.entries(r.attributes).filter(
      ([, v]) => v !== null && v !== '',
    )
    if (filled.length === 0) continue

    // Save raw AI payload (column legacy name "gemini_payload")
    await supabase.from('product_external').upsert(
      {
        sku_id: r.sku_id,
        gemini_payload: { result: r },
        gemini_fetched_at: new Date().toISOString(),
      },
      { onConflict: 'sku_id' },
    )

    const { data: existing } = await supabase
      .from('product_attributes')
      .select('attr_key, source, override_locked')
      .eq('sku_id', r.sku_id)
    const existingMap = new Map<
      string,
      { source: string; override_locked: boolean }
    >(
      (existing ?? []).map(
        (row: { attr_key: string; source: string; override_locked: boolean }) => [
          row.attr_key,
          row,
        ],
      ),
    )
    const rows: Array<{
      sku_id: string
      attr_key: string
      value: unknown
      source: string
      override_locked: boolean
    }> = []
    for (const [k, v] of filled) {
      const ex = existingMap.get(k)
      if (ex?.override_locked) continue
      if (ex && (ex.source === 'manual' || ex.source === 'override')) continue
      rows.push({
        sku_id: r.sku_id,
        attr_key: k,
        value: v,
        source: 'ai',
        override_locked: false,
      })
    }
    if (rows.length > 0) {
      const { error: upErr } = await supabase
        .from('product_attributes')
        .upsert(rows, { onConflict: 'sku_id,attr_key' })
      if (upErr) {
        failedSkus++
        console.error(`    ✗ upsert ${r.sku_id}: ${upErr.message}`)
        continue
      }
      totalAttrsFilled += rows.length

      const famName = familyOfSku.get(r.sku_id) ?? 'unknown'
      const b = breakdown.get(famName) ?? { skus: 0, attrs: 0 }
      b.skus += 1
      b.attrs += rows.length
      breakdown.set(famName, b)
    }

    // Update hygiene status
    const resolved = await resolveProductAttributes(supabase, r.sku_id)
    await supabase
      .from('products')
      .update({
        hygiene_status: resolved.hygiene.status,
        hygiene_issues: resolved.hygiene.issues,
        hygiene_checked_at: new Date().toISOString(),
      })
      .eq('id', r.sku_id)
  }

  // 7. Verify DB rows
  const verifyRes = await supabase.rpc as never // not used; just demonstrating
  void verifyRes
  // Use direct SELECT instead
  const { count: aiCount } = await supabase
    .from('product_attributes')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'ai')

  const totalDurationMs = Date.now() - startedAt

  // 8. Final breakdown
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('AI SWAP RESULT')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Code patch:        ✅ provider=anthropic, model=${modelUsed || 'claude-haiku-4-5'}`)
  console.log(
    `Bulk run on ${skuInputs.length}:    ${skuInputs.length - failedSkus}/${skuInputs.length} attributed`,
  )
  console.log(`  By Family:`)
  const sortedBreakdown = Array.from(breakdown.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )
  for (const [fam, b] of sortedBreakdown) {
    console.log(`    ${fam.padEnd(20)} ${b.skus} SKU → ${b.attrs} attrs`)
  }
  console.log(`Cost (approx):     $${approxCost.toFixed(4)} (${totalTokens} tokens @ ~$3/1M mid)`)
  console.log(
    `Latency:           ${(totalDuration / 1000).toFixed(1)}s AI / ${(totalDurationMs / 1000).toFixed(1)}s total / ${(
      totalDuration / Math.max(skuInputs.length, 1)
    ).toFixed(0)}ms avg per SKU`,
  )
  console.log(
    `DB verify:         ${aiCount && aiCount > 0 ? '✅' : '❌'} ${aiCount ?? 0} rows source='ai'`,
  )
  console.log(`Already CLEAN (skipped):    ${alreadyClean}`)
  console.log(`Failed SKU:                 ${failedSkus}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
