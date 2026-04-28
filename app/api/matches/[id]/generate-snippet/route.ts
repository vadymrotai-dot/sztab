// app/api/matches/[id]/generate-snippet/route.ts
// POST /api/matches/{id}/generate-snippet
// On-demand sales snippet generation за один match.
// Returns: { ok, snippet: SalesSnippet, cost_usd, duration_ms }

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSalesSnippet } from '@/lib/matching/sales-snippet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Niepoprawny match id' }, { status: 400 })
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

  const result = await generateSalesSnippet(supabase, apiKey, id)
  if (result.error || !result.snippet) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'snippet generation failed' },
      { status: 500 },
    )
  }
  return NextResponse.json({
    ok: true,
    snippet: result.snippet,
    cost_usd: result.cost_usd,
    duration_ms: result.duration_ms,
  })
}
