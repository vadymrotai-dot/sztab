// scripts/manual-trigger-market-intelligence.ts
// Sprint S-INTEL.1.2.1 — manually trigger market-intelligence cron job
// once after deploy щоб populate /admin/health з baseline cron_runs entry
// + verify ZSRIR ingestion working.
//
// Vercel Cron schedule = "0 6 * * 0" (Sunday 06:00 UTC) — first natural
// run може бути up to 7 days away. Скрипт runs ingestZsrir у тому ж самому
// pattern як production cron handler.
//
// Run:
//   pnpm exec tsx scripts/manual-trigger-market-intelligence.ts
//
// Persistent log: scripts/cowork/market-intelligence-{ISO_timestamp}.log

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { startCronRun, finishCronRun } from '@/lib/cron-runs'
import { ingestZsrir } from '@/lib/intelligence/zsrir'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

function nowIso(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function ensureCoworkDir(): string {
  const dir = path.resolve(process.cwd(), 'scripts', 'cowork')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

async function main() {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!svcKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing — додай у .env.local')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const coworkDir = ensureCoworkDir()
  const logPath = path.join(coworkDir, `market-intelligence-${nowIso()}.log`)
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })
  const log = (line: string) => logStream.write(line + '\n')

  console.log('\n══════ Manual market-intelligence trigger ══════\n')
  console.log(`Persistent log: ${logPath}\n`)
  log(`# Manual market-intelligence — ${new Date().toISOString()}`)
  log('')

  const startedAt = Date.now()
  const runId = await startCronRun(supabase, 'market-intelligence', {
    manual: true,
  })

  try {
    console.log('[ZSRIR] Ingesting...')
    log('## ZSRIR ingestion')
    const result = await ingestZsrir(supabase, { verbose: true })

    console.log('\n══════ ZSRIR Summary ══════')
    console.log(`Datasets processed: ${result.datasets_processed}`)
    console.log(`Datasets skipped:   ${result.datasets_skipped}`)
    console.log(`Rows inserted:      ${result.rows_inserted}`)
    console.log(`Rows skipped (dup): ${result.rows_skipped}`)
    console.log(`Rows failed:        ${result.rows_failed}`)
    if (result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`)
      for (const e of result.errors) console.log(`  ✗ ${e}`)
    }

    log(`Datasets processed: ${result.datasets_processed}`)
    log(`Datasets skipped: ${result.datasets_skipped}`)
    log(`Rows inserted: ${result.rows_inserted}`)
    log(`Rows skipped (duplicates): ${result.rows_skipped}`)
    log(`Rows failed: ${result.rows_failed}`)
    if (result.errors.length > 0) {
      log('')
      log('## Errors')
      for (const e of result.errors) log(`- ${e}`)
    }

    const hasErrors = result.errors.length > 0
    await finishCronRun(supabase, runId, hasErrors ? 'error' : 'success', {
      pairs_processed: result.rows_inserted,
      error_message: hasErrors ? result.errors.join('; ').slice(0, 1000) : undefined,
      meta: {
        manual: true,
        zsrir: {
          datasets_processed: result.datasets_processed,
          datasets_skipped: result.datasets_skipped,
          rows_inserted: result.rows_inserted,
          rows_skipped: result.rows_skipped,
          rows_failed: result.rows_failed,
          errors_count: result.errors.length,
        },
      },
    })

    const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
    console.log(`\nElapsed: ${elapsedSec}s`)
    console.log(`Log: ${logPath}`)
    console.log('\nNext steps:')
    console.log('  1. Open /admin/health → market-intelligence row')
    console.log("  2. SELECT * FROM commodity_prices WHERE source = 'zsrir' ORDER BY observation_date DESC LIMIT 20")
    console.log('  3. Verify CN code resolution via commodity_to_cn_map (run seed-commodity-to-cn-map.ts якщо ще не)')

    log('')
    log(`Elapsed: ${elapsedSec}s`)
    log(`Status: ${hasErrors ? 'error' : 'success'}`)

    logStream.end()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`\n❌ FATAL: ${msg}`)
    log('')
    log(`FATAL: ${msg}`)
    await finishCronRun(supabase, runId, 'error', {
      error_message: msg,
      meta: { manual: true, fatal: true },
    })
    logStream.end()
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
