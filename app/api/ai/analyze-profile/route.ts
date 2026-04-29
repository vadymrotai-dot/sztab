// app/api/ai/analyze-profile/route.ts
// Sprint M FIX 4 — manual trigger для analyzeBusinessProfile від
// /clients/[id] "Re-analyze" button. Replaces deprecated /api/ai/business-data
// + /api/ai/potential-analysis (consolidated до single business_profile).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeBusinessProfile } from '@/lib/ai/business-analysis'
import { startEnrichmentRun, finishEnrichmentRun } from '@/lib/profile/enrichment-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 })
  }

  let body: { clientId?: string } = {}
  try {
    body = (await req.json()) as { clientId?: string }
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }
  const { clientId } = body
  if (!clientId) {
    return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 })
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

  const runId = await startEnrichmentRun(supabase, {
    target_type: 'company',
    target_id: clientId,
    source: 'AI_business_analysis',
  })
  const result = await analyzeBusinessProfile(supabase, anthropicKey, clientId)
  if (result.profile) {
    await finishEnrichmentRun(supabase, runId, {
      status: 'success',
      raw_payload: result.profile,
      cost_usd: result.cost_usd,
    })
    return NextResponse.json({ ok: true, profile: result.profile, cost_usd: result.cost_usd })
  }
  await finishEnrichmentRun(supabase, runId, {
    status: 'error',
    error_message: result.error,
  })
  return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
}
