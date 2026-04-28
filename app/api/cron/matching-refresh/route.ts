// app/api/cron/matching-refresh/route.ts
// Vercel Cron handler — weekly refresh matches.
//
// Schedule: vercel.json crons → "0 0 * * 0" (Sunday 00:00 UTC = 01:00
// Warsaw winter / 02:00 Warsaw summer — DST-driven; spec asked Sunday
// 02:00 Warsaw).
//
// Auth: Vercel auto-injects CRON_SECRET → Authorization: Bearer ${SECRET}.
// Local dev: jeśli CRON_SECRET unset → pomijam check.
//
// Behavior: full bulkRecomputeAll() — overwrites expires_at на всіх pairs,
// gives 7-day fresh window. ~18-30K pairs у total, < 30s expected.
// Future optimization: if pairs > 100K — switch на partial scan
// (DISTINCT target_id WHERE expires_at < now() THEN per-target recompute).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bulkRecomputeAll } from '@/lib/matching/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
  const summary = await bulkRecomputeAll(supabase)

  return NextResponse.json({
    ok: summary.errors.length === 0,
    summary,
  })
}
