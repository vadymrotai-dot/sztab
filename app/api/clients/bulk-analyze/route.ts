// app/api/clients/bulk-analyze/route.ts
// Sprint S4 Phase 2D — bulk AI analyze для wybranych klientów. Cap 5 firm
// per call (sequential, ~30-60s każda; max ~5 min wymieszczone у Vercel
// maxDuration). Caller iteruje по batches > 5 jeśli potrzebują więcej.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeBusinessProfile } from '@/lib/ai/business-analysis'
import { startEnrichmentRun, finishEnrichmentRun } from '@/lib/profile/enrichment-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_CAP = 5

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 })
  }

  let body: { ids?: string[] } = {}
  try {
    body = (await req.json()) as { ids?: string[] }
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }
  const ids = (body.ids ?? []).slice(0, BATCH_CAP)
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'ids required' }, { status: 400 })
  }

  const { data: paramsRow } = await supabase
    .from('params')
    .select('anthropic_api_key')
    .limit(1)
    .maybeSingle()
  const anthropicKey =
    (paramsRow as { anthropic_api_key?: string } | null)?.anthropic_api_key ?? ''
  if (!anthropicKey) {
    return NextResponse.json(
      { ok: false, error: 'anthropic_api_key missing у params' },
      { status: 500 },
    )
  }

  let succeeded = 0
  let failed = 0
  const errors: Array<{ id: string; error: string }> = []

  for (const clientId of ids) {
    const runId = await startEnrichmentRun(supabase, {
      target_type: 'company',
      target_id: clientId,
      source: 'AI_business_analysis_bulk',
    })
    const result = await analyzeBusinessProfile(supabase, anthropicKey, clientId)
    if (result.profile) {
      succeeded += 1
      await finishEnrichmentRun(supabase, runId, {
        status: 'success',
        raw_payload: result.profile,
        cost_usd: result.cost_usd,
      })
    } else {
      failed += 1
      errors.push({ id: clientId, error: result.error ?? 'unknown' })
      await finishEnrichmentRun(supabase, runId, {
        status: 'error',
        error_message: result.error,
      })
    }
  }

  return NextResponse.json({ ok: true, succeeded, failed, errors })
}
