// app/api/admin/matching/ai-rescore-bulk/route.ts
// POST — rescore TOP-20 matches dla ВСІХ products (cost-guarded).
// Sync execution z full result, ale also creates job record для polling
// (consistent with existing /admin/jobs pattern).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rescoreAllProducts } from '@/lib/matching/ai-rescore'
import { createJob, finishJob } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  const { data: paramsRow } = await supabase
    .from('params')
    .select('anthropic_api_key')
    .limit(1)
    .maybeSingle()
  const apiKey = (paramsRow as { anthropic_api_key?: string } | null)?.anthropic_api_key ?? null
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'params.anthropic_api_key not set' },
      { status: 500 },
    )
  }

  const job = createJob<unknown>('ai-rescore-bulk')
  try {
    const result = await rescoreAllProducts(supabase, apiKey)
    finishJob(job.id, 'completed', result)
    return NextResponse.json({
      ok: true,
      job_id: job.id,
      result: {
        products_processed: result.summaries.length,
        successful: result.summaries.filter((s) => !s.error).length,
        errors: result.summaries.filter((s) => s.error).length,
        total_cost_usd: result.total_cost_usd,
        total_duration_ms: result.total_duration_ms,
        aborted_cost_guard: result.aborted,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    finishJob(job.id, 'failed', undefined, msg)
    return NextResponse.json({ ok: false, job_id: job.id, error: msg }, { status: 500 })
  }
}
