// scripts/smoke-test-sprint-j.ts
// Verifies all 4 Sprint J fixes:
//   #1 Primary match dedup (matches.is_primary_for_target)
//   #2 Apify pre-flight skip (findExistingContact)
//   #3 Cron runs telemetry (cron_runs entries exist)
//   #4 AI tooltip — visual only, skip

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'
import { findExistingContact } from '@/lib/enrichment/contact-preflight'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

const KRZYSZTOF_LECH_NIP = '9491834994' // Has client AND prospect rows (no contact data — pre-flight should return null = correct)
const SKLEPIK_NIP = '9521948373' // Has phone+email у clients (Bitrix import) — pre-flight should return data

interface CheckResult {
  fix: string
  status: '✅' | '⚠️' | '❌'
  details: string
  error?: string
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

  const results: CheckResult[] = []

  console.log('\n══════ Sprint J — Smoke Test 4 fixes ══════\n')

  // ─── Fix #1: Primary match dedup ───
  console.log('[1] Primary match dedup verification...')
  try {
    const { count: primaryCount } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('is_primary_for_target', true)
    const { count: totalCount } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })

    // Verify RPC accessible
    const rpc = await supabase.rpc('refresh_primary_match_flags')
    if (rpc.error) throw new Error(`RPC: ${rpc.error.message}`)

    // Test: 1 random target should have exactly 1 primary
    const { data: sampleProspect } = await supabase
      .from('matches')
      .select('prospect_id')
      .not('prospect_id', 'is', null)
      .limit(1)
      .maybeSingle()
    let dedupVerified = false
    if (sampleProspect?.prospect_id) {
      const { count: rowsCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('prospect_id', (sampleProspect as { prospect_id: string }).prospect_id)
      const { count: primariesForThisOne } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('prospect_id', (sampleProspect as { prospect_id: string }).prospect_id)
        .eq('is_primary_for_target', true)
      dedupVerified = primariesForThisOne === 1 && (rowsCount ?? 0) >= 1
    }

    results.push({
      fix: '#1 Primary match dedup',
      status: dedupVerified ? '✅' : '⚠️',
      details: `${primaryCount} primary / ${totalCount} total; sample target має exactly 1 primary: ${dedupVerified}`,
    })
    console.log(`    ${results[0].status}  ${results[0].details}`)
  } catch (err) {
    results.push({
      fix: '#1 Primary match dedup',
      status: '❌',
      details: '',
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // ─── Fix #2: Apify pre-flight ───
  // Two test cases:
  //   (a) NIP з contact data (Sklepik) — findExistingContact must return non-null
  //   (b) NIP без contact data (Krzysztof Lech) — must return null
  console.log('\n[2] Apify pre-flight test cases...')
  try {
    const checks: Array<{ label: string; passed: boolean; detail: string }> = []

    // Case A: Sklepik (з phone+email)
    const { data: sklepikClients } = await supabase
      .from('clients')
      .select('id, title')
      .eq('nip', SKLEPIK_NIP)
      .limit(1)
    const sklepik = (sklepikClients ?? [])[0] as { id: string; title: string } | undefined
    if (sklepik) {
      const r = await findExistingContact(supabase, 'client', sklepik.id)
      const passed = r !== null && (Boolean(r.phone) || Boolean(r.email))
      checks.push({
        label: `(a) ${sklepik.title.slice(0, 25)}`,
        passed,
        detail: r ? `${r.source}, phone=${Boolean(r.phone)}, email=${Boolean(r.email)}` : 'null (UNEXPECTED)',
      })
    }

    // Case B: Krzysztof Lech (no contact)
    const { data: lechClients } = await supabase
      .from('clients')
      .select('id, title')
      .eq('nip', KRZYSZTOF_LECH_NIP)
      .limit(1)
    const lech = (lechClients ?? [])[0] as { id: string; title: string } | undefined
    if (lech) {
      const r = await findExistingContact(supabase, 'client', lech.id)
      const passed = r === null // expecting null
      checks.push({
        label: `(b) ${lech.title.slice(0, 25)}`,
        passed,
        detail: r ? `${r.source} (UNEXPECTED — should be null)` : 'null (correct)',
      })
    }

    const allPassed = checks.length > 0 && checks.every((c) => c.passed)
    results.push({
      fix: '#2 Apify pre-flight',
      status: allPassed ? '✅' : '⚠️',
      details: checks.map((c) => `${c.passed ? '✓' : '✗'} ${c.label}: ${c.detail}`).join(' | '),
    })
    console.log(`    ${results[1].status}`)
    for (const c of checks) console.log(`      ${c.passed ? '✓' : '✗'} ${c.label}: ${c.detail}`)
  } catch (err) {
    results.push({
      fix: '#2 Apify pre-flight',
      status: '❌',
      details: '',
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // ─── Fix #3: Cron runs telemetry ───
  console.log('\n[3] Cron runs telemetry...')
  try {
    const { count } = await supabase
      .from('cron_runs')
      .select('*', { count: 'exact', head: true })
    const { data: latest } = await supabase
      .from('cron_runs')
      .select('job_name, status, started_at, pairs_processed')
      .order('started_at', { ascending: false })
      .limit(3)
    results.push({
      fix: '#3 Cron runs telemetry',
      status: (count ?? 0) > 0 ? '✅' : '❌',
      details: `${count ?? 0} entries у cron_runs; latest: ${((latest ?? []) as Array<{ job_name: string; status: string; pairs_processed: number | null }>).map((r) => `${r.job_name}=${r.status}(${r.pairs_processed ?? '?'})`).join(', ')}`,
    })
    console.log(`    ${results[2].status}  ${results[2].details}`)
  } catch (err) {
    results.push({
      fix: '#3 Cron runs telemetry',
      status: '❌',
      details: '',
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // ─── Fix #4: AI tooltip — visual only ───
  results.push({
    fix: '#4 AI tooltip',
    status: '⚠️',
    details: 'visual fix only — verify hover на /matches/global score badge',
  })
  console.log(`\n[4] ${results[3].status}  ${results[3].details}`)

  // ─── Eligible pool diagnostic ───
  console.log('\n[diag] Eligible pool summary...')
  const { data: eligibleData } = await supabase
    .from('matches')
    .select('client_id, prospect_id, is_primary_for_target, combined_score, apify_review_status')
    .eq('is_primary_for_target', true)
    .gte('combined_score', 70)
  const eligible = (eligibleData ?? []) as Array<{
    client_id: string | null
    prospect_id: string | null
    apify_review_status: string
  }>
  const approvedCount = eligible.filter((e) => e.apify_review_status === 'approved').length
  console.log(`    Primary-flagged + score≥70: ${eligible.length} matches`)
  console.log(`    approved: ${approvedCount} | pending: ${eligible.filter((e) => e.apify_review_status === 'pending').length} | skipped: ${eligible.filter((e) => e.apify_review_status === 'skipped').length}`)

  // ─── Final report ───
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('SPRINT J SMOKE TEST RESULT')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const r of results) {
    console.log(`${r.status}  ${r.fix.padEnd(30)}  ${r.details}`)
    if (r.error) console.log(`     error: ${r.error}`)
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
