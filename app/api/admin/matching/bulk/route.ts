// app/api/admin/matching/bulk/route.ts
// POST /api/admin/matching/bulk — full sweep clients + prospects.
//   Body: { clientsOnly?: boolean, prospectsOnly?: boolean }
// Returns: { ok, summary{clients_processed, prospects_processed,
//   pairs_inserted, duration_ms, errors[]} }

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bulkRecomputeAll } from '@/lib/matching/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface RequestBody {
  clientsOnly?: boolean
  prospectsOnly?: boolean
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

  const summary = await bulkRecomputeAll(supabase, body)
  return NextResponse.json({ ok: summary.errors.length === 0, summary })
}
