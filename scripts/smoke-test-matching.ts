// scripts/smoke-test-matching.ts
// Sprint F / Commit 8: end-to-end smoke test для matching engine.
//
// Picks 3 clients + 3 prospects з diverse PKD profiles, fetches TOP-5 matches
// for кожного, verifies acceptance criteria.
//
// Run:
//   pnpm exec tsx scripts/smoke-test-matching.ts

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

const CD_PROJEKT_ID = '4bb7280c-a3cb-49e9-92bf-23d45bc8522b'

interface MatchRow {
  id: string
  algo_score: number
  product_id: string
  reason_codes: string[]
  subscore_breakdown: { pkd: number; activity: number; size: number; geo: number; recency: number }
  loyalty_multiplier: number
}

async function main() {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!svcKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('\n══════ Sprint F Smoke Test ══════\n')

  // ─── Pick 3 clients ───
  // (a) HoReCa-relevant client — has 47.25.Z, 56.x or similar
  const { data: horecaClients } = await supabase
    .from('clients')
    .select('id, title, pkd_2007_codes, krs_legal_form')
    .not('pkd_2007_codes', 'is', null)
    .or(
      `pkd_2007_codes.cs.{4725Z},pkd_2007_codes.cs.{5610A},pkd_2007_codes.cs.{5610B},pkd_2007_codes.cs.{5630Z}`,
    )
    .limit(3)
  const horecaClient = horecaClients?.[0] ?? null

  // (b) CD PROJEKT
  const { data: cdProjekt } = await supabase
    .from('clients')
    .select('id, title, pkd_2007_codes, krs_legal_form')
    .eq('id', CD_PROJEKT_ID)
    .maybeSingle()

  // (c) Small JDG retail — 47.x не overlap з horecaClient
  const { data: smallRetailCandidates } = await supabase
    .from('clients')
    .select('id, title, pkd_2007_codes, krs_legal_form')
    .not('pkd_2007_codes', 'is', null)
    .or(`pkd_2007_codes.cs.{4711Z},pkd_2007_codes.cs.{4729Z},pkd_2007_codes.cs.{4791Z}`)
    .limit(5)
  const smallRetail =
    (smallRetailCandidates ?? []).find(
      (c) => c.id !== horecaClient?.id && c.id !== CD_PROJEKT_ID,
    ) ?? null

  // ─── Pick 3 prospects ───
  // (d) HoReCa-relevant prospect — has 56.10.A or 56.30.Z
  const { data: horecaProspects } = await supabase
    .from('ceidg_prospects')
    .select('id, name, pkd_main, pkd_all')
    .or(`pkd_main.eq.5610A,pkd_main.eq.5630Z,pkd_main.eq.5610B,pkd_main.eq.4725Z`)
    .limit(3)
  const horecaProspect = horecaProspects?.[0] ?? null

  // (e) 46.x wholesale prospect
  const { data: wholesaleProspects } = await supabase
    .from('ceidg_prospects')
    .select('id, name, pkd_main, pkd_all')
    .or(`pkd_main.like.46*`)
    .limit(3)
  const wholesaleProspect = wholesaleProspects?.[0] ?? null

  // (f) Lowest-scoring prospect (likely adjacent or weak PKD-fit)
  const { data: lowProspects } = await supabase
    .from('matches')
    .select('prospect_id')
    .not('prospect_id', 'is', null)
    .order('algo_score', { ascending: true })
    .limit(1)
  const lowProspectId = (lowProspects?.[0] as { prospect_id: string } | undefined)?.prospect_id ?? null
  const { data: lowProspectRow } = lowProspectId
    ? await supabase
        .from('ceidg_prospects')
        .select('id, name, pkd_main, pkd_all')
        .eq('id', lowProspectId)
        .maybeSingle()
    : { data: null }

  // ─── Helper: fetch TOP-5 matches з product info ───
  async function topMatches(
    keyType: 'client_id' | 'prospect_id',
    keyValue: string | null,
    label: string,
  ): Promise<void> {
    if (!keyValue) {
      console.log(`\n  ${label}: ⚠️  not found in DB`)
      return
    }
    const { data: rows } = await supabase
      .from('matches')
      .select('id, algo_score, product_id, reason_codes, subscore_breakdown, loyalty_multiplier')
      .eq(keyType, keyValue)
      .order('algo_score', { ascending: false })
      .limit(5)
    const matches = (rows ?? []) as MatchRow[]

    if (matches.length === 0) {
      console.log(`  ${label}: ⚠️  no matches (target may не be classified)`)
      return
    }

    const productIds = Array.from(new Set(matches.map((m) => m.product_id)))
    const { data: products } = await supabase
      .from('products')
      .select('id, name, brand, family_id')
      .in('id', productIds)
    const productMap = new Map<string, { name: string; brand: string | null }>()
    for (const p of (products ?? []) as Array<{ id: string; name: string; brand: string | null }>) {
      productMap.set(p.id, p)
    }

    console.log(`\n  ${label}:`)
    for (const m of matches) {
      const p = productMap.get(m.product_id)
      console.log(
        `    score=${m.algo_score.toString().padStart(3)} | ${(p?.name ?? '?').slice(0, 40).padEnd(40)} | ` +
          `pkd:${m.subscore_breakdown.pkd} act:${m.subscore_breakdown.activity} size:${m.subscore_breakdown.size}` +
          (m.loyalty_multiplier !== 1 ? ` ×${m.loyalty_multiplier}` : '') +
          ` | ${m.reason_codes.slice(0, 3).join(', ')}`,
      )
    }
  }

  // ─── Print sections ───
  console.log('═══ CLIENTS ═══')
  if (horecaClient) {
    console.log(`(a) HoReCa-PKD client: ${horecaClient.title}`)
    console.log(`    PKD: ${(horecaClient.pkd_2007_codes ?? []).slice(0, 6).join(', ')}`)
    await topMatches('client_id', horecaClient.id, '    TOP-5 matches')
  } else {
    console.log('(a) ⚠️  no HoReCa-PKD client found')
  }

  if (cdProjekt) {
    console.log(`\n(b) CD PROJEKT (${cdProjekt.title})`)
    console.log(`    PKD: ${(cdProjekt.pkd_2007_codes ?? []).slice(0, 6).join(', ')}`)
    await topMatches('client_id', cdProjekt.id, '    TOP-5 matches (expected: low/zero)')
  } else {
    console.log('\n(b) ⚠️  CD PROJEKT not found')
  }

  if (smallRetail) {
    console.log(`\n(c) Small retail JDG: ${smallRetail.title}`)
    console.log(`    PKD: ${(smallRetail.pkd_2007_codes ?? []).slice(0, 6).join(', ')}`)
    await topMatches('client_id', smallRetail.id, '    TOP-5 matches')
  } else {
    console.log('\n(c) ⚠️  no small retail JDG found')
  }

  console.log('\n═══ PROSPECTS ═══')
  if (horecaProspect) {
    console.log(`(d) HoReCa prospect: ${horecaProspect.name}`)
    console.log(`    PKD main: ${horecaProspect.pkd_main}, all: ${(horecaProspect.pkd_all ?? []).slice(0, 4).join(', ')}`)
    await topMatches('prospect_id', horecaProspect.id, '    TOP-5 matches (expected: HIGH)')
  } else {
    console.log('(d) ⚠️  no HoReCa prospect found')
  }

  if (wholesaleProspect) {
    console.log(`\n(e) Wholesale prospect: ${wholesaleProspect.name}`)
    console.log(`    PKD main: ${wholesaleProspect.pkd_main}`)
    await topMatches('prospect_id', wholesaleProspect.id, '    TOP-5 matches')
  } else {
    console.log('\n(e) ⚠️  no 46.x wholesale prospect found')
  }

  if (lowProspectRow) {
    console.log(`\n(f) Low-score prospect: ${lowProspectRow.name}`)
    console.log(`    PKD main: ${lowProspectRow.pkd_main}`)
    await topMatches('prospect_id', lowProspectRow.id, '    TOP-5 matches')
  } else {
    console.log('\n(f) ⚠️  no low-score prospect identified')
  }

  // ─── Acceptance criteria checks ───
  console.log('\n═══ ACCEPTANCE CRITERIA ═══')

  // #2: matches table populated
  const { count: total } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
  console.log(`#2 matches table populated: ${total ?? 0} rows ${(total ?? 0) >= 50000 ? '⚠️ <50K' : (total ?? 0) > 0 ? '✅' : '❌'}`)

  // #3: CD PROJEKT zero matches з algo_score ≥ 50
  const { count: cdHigh } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', CD_PROJEKT_ID)
    .gte('algo_score', 50)
  console.log(
    `#3 CD PROJEKT з algo_score≥50:    ${cdHigh ?? 0} ${(cdHigh ?? 0) === 0 ? '✅' : '⚠️ expected 0'}`,
  )

  // #4 (updated): ≥10 prospects з algo_score ≥ 60
  const { data: prospectsHigh } = await supabase
    .from('matches')
    .select('prospect_id')
    .not('prospect_id', 'is', null)
    .gte('algo_score', 60)
  const distinctProspectsHigh = new Set(
    (prospectsHigh ?? []).map((r) => (r as { prospect_id: string }).prospect_id),
  ).size
  console.log(
    `#4 distinct prospects ≥60:        ${distinctProspectsHigh} ${distinctProspectsHigh >= 10 ? '✅' : '❌ expected ≥10'}`,
  )

  // #5: reason codes nonempty
  const { data: emptyReasons } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: false })
    .or('reason_codes.is.null,reason_codes.eq.{}')
    .limit(1)
  console.log(
    `#5 reason_codes nonempty:        ${(emptyReasons?.length ?? 0) === 0 ? '✅' : '⚠️ found empty'}`,
  )

  // ─── Validate D-thesis: prospect (d) > all 3 clients ───
  if (horecaProspect) {
    const { data: pdTop } = await supabase
      .from('matches')
      .select('algo_score')
      .eq('prospect_id', horecaProspect.id)
      .order('algo_score', { ascending: false })
      .limit(1)
    const pdScore = (pdTop?.[0] as { algo_score: number } | undefined)?.algo_score ?? 0

    const clientIds = [horecaClient?.id, cdProjekt?.id, smallRetail?.id].filter(
      Boolean,
    ) as string[]
    let maxClientScore = 0
    for (const cid of clientIds) {
      const { data: cTop } = await supabase
        .from('matches')
        .select('algo_score')
        .eq('client_id', cid)
        .order('algo_score', { ascending: false })
        .limit(1)
      const s = (cTop?.[0] as { algo_score: number } | undefined)?.algo_score ?? 0
      maxClientScore = Math.max(maxClientScore, s)
    }
    console.log(
      `D-thesis (prospect_d > всі clients): ${pdScore} > ${maxClientScore} ${pdScore > maxClientScore ? '✅' : '⚠️ unexpected'}`,
    )
  }

  // Differentiation check
  const { data: scoreSpread } = await supabase
    .from('matches')
    .select('algo_score')
  const scores = ((scoreSpread ?? []) as Array<{ algo_score: number }>).map((r) => r.algo_score)
  const uniqueScores = new Set(scores).size
  console.log(`Differentiation: ${uniqueScores} distinct scores (out of ${scores.length} pairs)`)
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
