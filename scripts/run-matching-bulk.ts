// scripts/run-matching-bulk.ts
// One-shot bulk matching computation (clients + prospects × products).
// Service-role bypass (skirt API auth complexity). Reports summary.
//
// Run:
//   pnpm exec tsx scripts/run-matching-bulk.ts [--clients-only|--prospects-only]

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'

import { bulkRecomputeAll } from '@/lib/matching/engine'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

async function main() {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!svcKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const clientsOnly = args.includes('--clients-only')
  const prospectsOnly = args.includes('--prospects-only')

  const supabase = createClient(SUPABASE_URL, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('\n══════ Matching bulk recompute ══════\n')
  console.log(
    `  scope: ${clientsOnly ? 'clients only' : prospectsOnly ? 'prospects only' : 'both'}`,
  )
  const startedAt = Date.now()

  const summary = await bulkRecomputeAll(supabase, { clientsOnly, prospectsOnly })
  const totalDuration = Date.now() - startedAt

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('BULK MATCHING SUMMARY')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Clients processed:    ${summary.clients_processed}`)
  console.log(`Prospects processed:  ${summary.prospects_processed}`)
  console.log(`Pairs upserted:       ${summary.pairs_inserted}`)
  console.log(`Engine duration:      ${(summary.duration_ms / 1000).toFixed(1)}s`)
  console.log(`Wall-clock total:     ${(totalDuration / 1000).toFixed(1)}s`)
  if (summary.errors.length > 0) {
    console.log(`\nErrors (${summary.errors.length}):`)
    for (const e of summary.errors) console.log(`  - ${e}`)
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Verify counts in DB
  const { count: total } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
  const { count: highScore } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .gte('algo_score', 60)
  const { count: clientMatches } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .not('client_id', 'is', null)
  const { count: prospectMatches } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .not('prospect_id', 'is', null)

  console.log(`\nDB verify:`)
  console.log(`  matches total:       ${total ?? '?'}`)
  console.log(`  client matches:      ${clientMatches ?? '?'}`)
  console.log(`  prospect matches:    ${prospectMatches ?? '?'}`)
  console.log(`  ≥60 score:           ${highScore ?? '?'}`)
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
