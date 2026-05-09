// app/api/cohorts/[id]/bulk-enrich-apify/route.ts
// Phase 2 Krok 1.E (09.05.2026) — bulk Apify Google Maps enrichment для
// усієї cohort (prospects + clients members з NIP).
//
// SYNC pattern (maxDuration=300, no async/polling) — matches existing
// /api/admin/enrich/apify-batch convention. 50 NIPs × ~3-5s avg ≤ 4 min,
// fits within Vercel Pro tier 5-min timeout. Frontend awaits response,
// shows summary alert.
//
// Vadym decisions:
//   - Q1 Option A: SYNC, maxDuration=300
//   - Q3 hard cap 50 NIPs → 400 з PL message якщо exceeded
//   - Cost guard: budget_usd default $5
//   - Pre-flight skip via findExistingContact (executeBatch handles)
//
// Body (optional): { dry_run?: boolean, budget_usd?: number }

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildCohortBatchPlan,
  executeBatch,
  APIFY_BATCH_BUDGET_DEFAULT,
} from '@/lib/enrichment/apify-batch'
import { createJob, finishJob } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const COHORT_HARD_CAP = 50

interface RequestBody {
  dry_run?: boolean
  budget_usd?: number
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Nieautoryzowany' },
      { status: 401 },
    )
  }

  const { id: cohortId } = await params
  if (!cohortId || !/^[0-9a-f-]{36}$/i.test(cohortId)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawne cohort id' },
      { status: 400 },
    )
  }

  // Verify cohort exists (RLS access check)
  const { data: cohort, error: cohortErr } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('id', cohortId)
    .single()
  if (cohortErr || !cohort) {
    return NextResponse.json(
      { ok: false, error: 'Cohort не знайдено або brak dostępu' },
      { status: 404 },
    )
  }

  let body: RequestBody = {}
  try {
    body = (await req.json()) as RequestBody
  } catch {
    body = {}
  }

  const opts = {
    dry_run: body.dry_run ?? false,
    budget_usd: body.budget_usd ?? APIFY_BATCH_BUDGET_DEFAULT,
  }

  // Build cohort plan
  const plan = await buildCohortBatchPlan(supabase, cohortId)

  // Q3 hard cap — REJECT з clear PL message якщо >50 unique NIPs
  if (plan.unique_nips > COHORT_HARD_CAP) {
    return NextResponse.json(
      {
        ok: false,
        error: `Cohort ma ${plan.unique_nips} unikalnych NIPów — przekracza limit ${COHORT_HARD_CAP}. Подziel cohort na mniejsze albo użyj filtrów statusów (callback / pending) щоб zawęzić scope.`,
        plan,
      },
      { status: 400 },
    )
  }

  // Refuse якщо no eligible NIPs (всі members без NIP або cohort пуста)
  if (plan.unique_nips === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          plan.skipped_no_nip > 0
            ? `Жоден з ${plan.skipped_no_nip} członków nie ma NIP — Apify enrichment niemożliwe.`
            : 'Cohort пуста — nie ma kogo wzbogacać.',
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
        error: `Estimated cost $${plan.estimated_cost_usd} przekracza budget $${opts.budget_usd}.`,
        plan,
      },
      { status: 400 },
    )
  }

  // dry_run — повертаємо plan без execution
  if (opts.dry_run) {
    return NextResponse.json({ ok: true, dry_run: true, cohort_name: cohort.name, plan })
  }

  // Read Apify token з params table (existing convention)
  const { data: paramsRow } = await supabase
    .from('params')
    .select('apify_api_token')
    .limit(1)
    .maybeSingle()
  const apifyKey =
    (paramsRow as { apify_api_token?: string } | null)?.apify_api_token ?? null
  if (!apifyKey) {
    return NextResponse.json(
      { ok: false, error: 'params.apify_api_token не ustawiony — skonfiguruj у /settings.' },
      { status: 500 },
    )
  }

  // Execute batch (SYNC, executeBatch reused 1:1 з matches workflow)
  const job = createJob<unknown>('cohort-apify-batch')
  try {
    const summary = await executeBatch(supabase, apifyKey, plan)
    finishJob(job.id, 'completed', summary)
    return NextResponse.json({
      ok: true,
      job_id: job.id,
      cohort_name: cohort.name,
      plan,
      summary,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    finishJob(job.id, 'failed', undefined, msg)
    return NextResponse.json(
      { ok: false, job_id: job.id, error: msg },
      { status: 500 },
    )
  }
}
