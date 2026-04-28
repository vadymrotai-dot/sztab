// app/api/matches/[id]/review/route.ts
// PATCH — set apify_review_status дla single match.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  status?: 'pending' | 'approved' | 'skipped'
}

export async function PATCH(
  req: Request,
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

  let body: RequestBody = {}
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Niepoprawny JSON' }, { status: 400 })
  }
  const status = body.status
  if (!status || !['pending', 'approved', 'skipped'].includes(status)) {
    return NextResponse.json(
      { ok: false, error: 'Wymagany status: pending|approved|skipped' },
      { status: 400 },
    )
  }

  const update: Record<string, unknown> = {
    apify_review_status: status,
    apify_reviewed_at: status === 'pending' ? null : new Date().toISOString(),
    apify_reviewed_by: status === 'pending' ? null : user.email ?? user.id,
  }

  const { error } = await supabase.from('matches').update(update).eq('id', id)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, status })
}
