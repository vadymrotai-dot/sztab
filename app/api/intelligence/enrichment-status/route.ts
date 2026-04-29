// app/api/intelligence/enrichment-status/route.ts
// Sprint M FIX 3 — list still-running enrichment_log rows для clientId.
// Polled by components/clients/enrichment-progress-banner every 10s.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 })
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 })
  }

  // Stale runs (>5 min без completion) considered failed-and-stuck — exclude
  // через cutoff. Otherwise banner would never disappear коли PHASE B crashes.
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('enrichment_log')
    .select('source, status, run_started_at, run_completed_at')
    .eq('target_id', clientId)
    .eq('status', 'running')
    .gte('run_started_at', cutoff)
    .order('run_started_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ ok: true, running: data ?? [] })
}
