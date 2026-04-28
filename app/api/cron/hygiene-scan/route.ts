// app/api/cron/hygiene-scan/route.ts
// GET /api/cron/hygiene-scan — Vercel Cron handler.
//
// Schedule: vercel.json crons → "0 1 * * *" (01:00 UTC = 02:00 winter
// / 03:00 summer Europe/Warsaw — DST-dependent). Spec asked 03:00 Warsaw
// — closest stable UTC є 01:00.
//
// Auth: Vercel auto-injects CRON_SECRET; production requests carry
// `Authorization: Bearer ${CRON_SECRET}`. Local dev: jeśli CRON_SECRET
// unset — pomijam check (dev convenience).
//
// Behavior: full-table scan products з family_id. For each — runs
// resolveProductAttributes(), updates hygiene_status / hygiene_issues /
// hygiene_checked_at. Returns summary.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProductAttributes } from '@/lib/product-attributes'
import { startCronRun, finishCronRun } from '@/lib/cron-runs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  // Auth check (Vercel Cron z CRON_SECRET)
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
  // CRON_SECRET unset → dev mode, pass through

  const supabase = await createClient()
  const runId = await startCronRun(supabase, 'hygiene-scan')

  const { data: productRows, error } = await supabase
    .from('products')
    .select('id, family_id')
  if (error) {
    await finishCronRun(supabase, runId, 'error', { error_message: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  const products = (productRows ?? []) as Array<{ id: string; family_id: string | null }>

  const summary = {
    total: products.length,
    clean: 0,
    dirty: 0,
    unchecked: 0,
    failed: 0,
  }
  const startedAt = Date.now()

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
      console.error(`[CRON_HYGIENE] product ${p.id}:`, err instanceof Error ? err.message : err)
    }
  }

  await finishCronRun(supabase, runId, summary.failed === 0 ? 'success' : 'error', {
    pairs_processed: summary.total,
    error_message: summary.failed > 0 ? `${summary.failed} products failed` : undefined,
    meta: { clean: summary.clean, dirty: summary.dirty, unchecked: summary.unchecked },
  })

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - startedAt,
    summary,
  })
}
