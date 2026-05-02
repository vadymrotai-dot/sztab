// app/api/cron/market-intelligence/route.ts
// Vercel Cron handler — weekly market intelligence ingestion.
//
// Schedule: vercel.json crons → "0 6 * * 0" (Sunday 06:00 UTC =
// 07:00 Warsaw winter / 08:00 Warsaw summer). After matching-refresh
// (Sunday 00:00 UTC) — fresh commodity data ready для weekly Algorithm
// tuning якщо Layer 2 запуститься (Protocol 15).
//
// Auth: Vercel auto-injects CRON_SECRET → Authorization: Bearer ${SECRET}.
// Local dev: jeśli CRON_SECRET unset → pomijam check.
//
// Sub-sprint scope (S-INTEL.1.2.1):
//   - ZSRIR ingestion (datasets 912 owoce-warzywa + 1024 mleko)
//
// Future steps (added incrementally у follow-up sub-sprints):
//   TODO S-INTEL.1.2.2 — fresh-market.pl scraping (top 5 PL markets)
//   TODO S-INTEL.1.2.3 — EU Agri-food REST/CSV
//   TODO S-INTEL.1.2.3 — generate market_signals AFTER all sources success

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { startCronRun, finishCronRun } from '@/lib/cron-runs'
import { ingestZsrir } from '@/lib/intelligence/zsrir'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — fits всі sources sequential

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized cron call' },
        { status: 401 },
      )
    }
  }

  const supabase = await createClient()
  const runId = await startCronRun(supabase, 'market-intelligence')

  const summary = {
    zsrir: {
      rows_inserted: 0,
      rows_skipped: 0,
      rows_failed: 0,
      datasets_processed: 0,
      datasets_skipped: 0,
      errors: [] as string[],
    },
    // TODO S-INTEL.1.2.2: fresh_market: { ... }
    // TODO S-INTEL.1.2.3: eu_agri: { ... }
    // TODO S-INTEL.1.2.3: signals: { ... }
  }
  const allErrors: string[] = []

  try {
    // ──────── 1. ZSRIR (Polish gov free open data) ────────
    try {
      const zsrirResult = await ingestZsrir(supabase, { verbose: true })
      summary.zsrir = zsrirResult
      if (zsrirResult.errors.length > 0) {
        allErrors.push(...zsrirResult.errors.map((e) => `[zsrir] ${e}`))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      allErrors.push(`[zsrir] FATAL: ${msg}`)
    }

    // TODO S-INTEL.1.2.2: ──────── 2. fresh-market.pl (cheerio scrape) ────────
    // try {
    //   const fmResult = await ingestFreshMarket(supabase, { verbose: true })
    //   summary.fresh_market = fmResult
    //   ...
    // }

    // TODO S-INTEL.1.2.3: ──────── 3. EU Agri-food (REST/CSV) ────────
    // ...

    // TODO S-INTEL.1.2.3: ──────── 4. Generate signals AFTER ingestion ────────
    // ...

    const totalInserted = summary.zsrir.rows_inserted
    const totalProcessed = summary.zsrir.datasets_processed
    const totalSkipped = summary.zsrir.datasets_skipped

    // Logical status — 4 cases. 'partial' indicates silent failure
    // (datasets skipped без AI rows). DB CHECK блокує 'partial' value
    // (migration 027: status IN running/success/error), тому map до 'error'
    // з meta.partial=true для UI distinction у /admin/health.
    let logicalStatus: 'success' | 'error' | 'partial'
    if (allErrors.length > 0) {
      logicalStatus = 'error'
    } else if (totalInserted > 0) {
      logicalStatus = 'success'
    } else if (totalProcessed > 0) {
      // Datasets processed but 0 inserted = legitimate idempotent re-run (all
      // rows already у DB). Still success.
      logicalStatus = 'success'
    } else if (totalSkipped > 0) {
      // Datasets skipped без error AND без processed = silent failure
      // (e.g. resource fetch returned null, parser found 0 rows for HIGH-priority
      // dataset). Surface через 'partial'.
      logicalStatus = 'partial'
    } else {
      // 0 datasets — registry has no HIGH priority entries (Vadym disabled all)
      logicalStatus = 'success'
    }

    // DB writes 'success' | 'error' only. 'partial' → 'error' + meta flag.
    const dbStatus: 'success' | 'error' =
      logicalStatus === 'success' ? 'success' : 'error'

    await finishCronRun(supabase, runId, dbStatus, {
      pairs_processed: totalInserted,
      error_message:
        logicalStatus === 'partial'
          ? `Silent failure: ${totalSkipped} datasets skipped, 0 rows ingested. Check resource fetch + parser.`
          : allErrors.join('; ').slice(0, 1000) || undefined,
      meta: {
        summary,
        logical_status: logicalStatus,
        partial: logicalStatus === 'partial',
      },
    })

    return NextResponse.json({
      ok: logicalStatus === 'success',
      logical_status: logicalStatus,
      summary,
      errors: allErrors,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await finishCronRun(supabase, runId, 'error', {
      error_message: msg,
      meta: { summary, partial: true },
    })
    return NextResponse.json({ ok: false, error: msg, summary }, { status: 500 })
  }
}
