// scripts/manual-trigger-crons.ts
// Sprint J / Issue 3 fix — manually trigger cron jobs once після deploy
// щоб populate /admin/health з baseline cron_runs entries.
//
// Vercel Cron schedules trigger тільки на naturalно-cron occurrence after
// next deploy — first run може бути up to 7 days away (matching-refresh
// weekly Sunday). Цей скрипт runs both jobs immediately з тiei самoy
// telemetry pattern як production cron handlers.
//
// Run:
//   pnpm exec tsx scripts/manual-trigger-crons.ts [--matching|--hygiene|--both]

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'

import { bulkRecomputeAll } from '@/lib/matching/engine'
import { resolveProductAttributes } from '@/lib/product-attributes'
import { startCronRun, finishCronRun } from '@/lib/cron-runs'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

async function triggerMatchingRefresh(supabase: ReturnType<typeof createClient>): Promise<void> {
  console.log('\n[matching-refresh] starting...')
  const runId = await startCronRun(supabase, 'matching-refresh', { manual: true })
  try {
    const summary = await bulkRecomputeAll(supabase)
    await finishCronRun(
      supabase,
      runId,
      summary.errors.length === 0 ? 'success' : 'error',
      {
        pairs_processed: summary.pairs_inserted,
        error_message: summary.errors.join('; ') || undefined,
        meta: {
          clients_processed: summary.clients_processed,
          prospects_processed: summary.prospects_processed,
          manual: true,
        },
      },
    )
    console.log(
      `[matching-refresh] DONE: ${summary.pairs_inserted} pairs, ` +
        `${summary.clients_processed}c + ${summary.prospects_processed}p, ` +
        `${(summary.duration_ms / 1000).toFixed(1)}s` +
        (summary.errors.length > 0 ? ` (${summary.errors.length} errors)` : ''),
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await finishCronRun(supabase, runId, 'error', { error_message: msg })
    console.error(`[matching-refresh] ERROR: ${msg}`)
  }
}

async function triggerHygieneScan(supabase: ReturnType<typeof createClient>): Promise<void> {
  console.log('\n[hygiene-scan] starting...')
  const runId = await startCronRun(supabase, 'hygiene-scan', { manual: true })

  const { data: productRows, error } = await supabase.from('products').select('id, family_id')
  if (error) {
    await finishCronRun(supabase, runId, 'error', { error_message: error.message })
    console.error(`[hygiene-scan] ERROR fetch products: ${error.message}`)
    return
  }
  const products = (productRows ?? []) as Array<{ id: string; family_id: string | null }>
  const summary = { total: products.length, clean: 0, dirty: 0, unchecked: 0, failed: 0 }

  for (const p of products) {
    try {
      const resolved = await resolveProductAttributes(supabase, p.id)
      const status = resolved.hygiene.status
      summary[status.toLowerCase() as 'clean' | 'dirty' | 'unchecked']++
      await supabase
        .from('products')
        .update({
          hygiene_status: status,
          hygiene_issues: resolved.hygiene.issues,
          hygiene_checked_at: new Date().toISOString(),
        })
        .eq('id', p.id)
    } catch (err) {
      summary.failed++
      console.warn(`[hygiene-scan] product ${p.id}: ${err instanceof Error ? err.message : err}`)
    }
  }

  await finishCronRun(supabase, runId, summary.failed === 0 ? 'success' : 'error', {
    pairs_processed: summary.total,
    error_message: summary.failed > 0 ? `${summary.failed} products failed` : undefined,
    meta: { clean: summary.clean, dirty: summary.dirty, unchecked: summary.unchecked, manual: true },
  })
  console.log(
    `[hygiene-scan] DONE: total=${summary.total}, clean=${summary.clean}, ` +
      `dirty=${summary.dirty}, unchecked=${summary.unchecked}, failed=${summary.failed}`,
  )
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

  const args = process.argv.slice(2)
  const wantMatching = args.includes('--matching') || args.includes('--both') || args.length === 0
  const wantHygiene = args.includes('--hygiene') || args.includes('--both') || args.length === 0

  console.log('══════ Manual cron trigger ══════')
  console.log(`  matching-refresh: ${wantMatching ? '✓' : '✗'}`)
  console.log(`  hygiene-scan:     ${wantHygiene ? '✓' : '✗'}`)

  if (wantMatching) await triggerMatchingRefresh(supabase)
  if (wantHygiene) await triggerHygieneScan(supabase)

  // Verify cron_runs populated
  const { count } = await supabase
    .from('cron_runs')
    .select('*', { count: 'exact', head: true })
  console.log(`\n[verify] cron_runs total entries: ${count ?? '?'}`)
  console.log('Open /admin/health to see them.')
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
