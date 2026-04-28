// app/api/admin/matching/recompute-prospect/route.ts
// POST ?id=<uuid> — recompute matches для одного prospect.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeMatchesForProspect } from '@/lib/matching/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Wymagany id (UUID)' }, { status: 400 })
  }

  const r = await computeMatchesForProspect(supabase, id)
  return NextResponse.json({ ok: r.ok, count: r.count, error: r.error })
}
