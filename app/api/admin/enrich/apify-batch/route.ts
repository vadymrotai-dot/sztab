// app/api/admin/enrich/apify-batch/route.ts
// POST — bulk Apify contact enrichment з NIP dedup.
//
// Body: { source: 'clients'|'prospects'|'mixed', min_combined_score: 60,
//         limit: 50, dry_run: false, budget_usd: 5 }
//
// dry_run=true → returns plan тільки.
// estimated_cost > budget → 400.
// inakshe → sync execution з write-back, returns ApifyBatchSummary.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildBatchPlan,
  executeBatch,
  APIFY_BATCH_BUDGET_DEFAULT,
} from '@/lib/enrichment/apify-batch'
import { createJob, finishJob } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface RequestBody {
  source?: 'clients' | 'prospects' | 'mixed'
  min_combined_score?: number
  limit?: number
  dry_run?: boolean
  budget_usd?: number
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  let body: RequestBody = {}
  try {
    body = (await req.json()) as RequestBody
  } catch {
    body = {}
  }

  const opts = {
    source: body.source ?? 'mixed',
    min_combined_score: Math.max(0, body.min_combined_score ?? 60),
    limit: Math.min(Math.max(body.limit ?? 50, 1), 200),
    dry_run: body.dry_run ?? false,
    budget_usd: body.budget_usd ?? APIFY_BATCH_BUDGET_DEFAULT,
  }

  // Build plan (Sprint I: filters to apify_review_status='approved' only)
  const plan = await buildBatchPlan(supabase, opts)

  // Sprint I: refuse якщо no approved matches → review queue first
  if (plan.unique_nips === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Brak approved matches w kolejce. Otwórz /matches/review, zatwierdź candidates і spróbuj ponownie.',
        plan,
      },
      { status: 400 },
    )
  }

  // Cost guard
  if (plan.estimated_cost_usd > opts.budget_usd) {
    return NextResponse.json(
      {
        ok: false,
        error: `estimated_cost $${plan.estimated_cost_usd} exceeds budget_usd $${opts.budget_usd}`,
        plan,
      },
      { status: 400 },
    )
  }

  if (opts.dry_run) {
    return NextResponse.json({ ok: true, dry_run: true, plan })
  }

  // Read Apify key from params
  const { data: paramsRow } = await supabase
    .from('params')
    .select('apify_api_token')
    .limit(1)
    .maybeSingle()
  const apifyKey =
    (paramsRow as { apify_api_token?: string } | null)?.apify_api_token ?? null
  if (!apifyKey) {
    return NextResponse.json(
      { ok: false, error: 'params.apify_api_token not set' },
      { status: 500 },
    )
  }

  const job = createJob<unknown>('apify-batch')
  try {
    const summary = await executeBatch(supabase, apifyKey, plan)
    finishJob(job.id, 'completed', summary)
    return NextResponse.json({ ok: true, job_id: job.id, plan, summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    finishJob(job.id, 'failed', undefined, msg)
    return NextResponse.json({ ok: false, job_id: job.id, error: msg }, { status: 500 })
  }
}
