// app/api/handoff/cohort/route.ts
// Sprint O Phase 5 — bulk-select export як kohorta з /clients hub.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 })

  let body: { cohort_name?: string; entity_ids?: string[]; source?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }
  const { cohort_name, entity_ids } = body
  if (!cohort_name || !Array.isArray(entity_ids) || entity_ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'cohort_name + entity_ids required' },
      { status: 400 },
    )
  }

  // Resolve type per id
  const [clientsRes, prospectsRes] = await Promise.all([
    supabase.from('clients').select('id').in('id', entity_ids),
    supabase.from('ceidg_prospects').select('id').in('id', entity_ids),
  ])
  const clientIds = new Set(((clientsRes.data ?? []) as Array<{ id: string }>).map((r) => r.id))
  const prospectIds = new Set(
    ((prospectsRes.data ?? []) as Array<{ id: string }>).map((r) => r.id),
  )

  const entity_ids_typed = entity_ids
    .map((id, idx) => {
      const type: 'client' | 'prospect' | null = clientIds.has(id)
        ? 'client'
        : prospectIds.has(id)
          ? 'prospect'
          : null
      if (!type) return null
      return { id, type, rank: idx + 1 }
    })
    .filter((x): x is { id: string; type: 'client' | 'prospect'; rank: number } => x !== null)

  const metadata = {
    source: body.source ?? 'manual_select',
    created_by: user.id,
    distribution: {
      clients: entity_ids_typed.filter((e) => e.type === 'client').length,
      prospects: entity_ids_typed.filter((e) => e.type === 'prospect').length,
    },
  }

  const { data, error } = await supabase
    .from('pikniko_handoff_cohorts')
    .upsert(
      { cohort_name, entity_ids: entity_ids_typed, metadata },
      { onConflict: 'cohort_name' },
    )
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  const cohortId = (data as { id: string } | null)?.id
  return NextResponse.json({
    ok: true,
    cohort_id: cohortId,
    redirect: `/handoff/pikniko?cohort=${cohortId}`,
  })
}
