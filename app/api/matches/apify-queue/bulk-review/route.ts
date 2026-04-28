// app/api/matches/apify-queue/bulk-review/route.ts
// PATCH — bulk set apify_review_status дla N match_ids.
// Body: { match_ids: string[], status: 'pending'|'approved'|'skipped' }

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface RequestBody {
  match_ids?: string[]
  status?: 'pending' | 'approved' | 'skipped'
}

export async function PATCH(req: Request) {
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
    return NextResponse.json({ ok: false, error: 'Niepoprawny JSON' }, { status: 400 })
  }
  const status = body.status
  const ids = Array.isArray(body.match_ids) ? body.match_ids : []
  if (!status || !['pending', 'approved', 'skipped'].includes(status)) {
    return NextResponse.json(
      { ok: false, error: 'Wymagany status: pending|approved|skipped' },
      { status: 400 },
    )
  }
  if (ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'match_ids musi być непустим array' },
      { status: 400 },
    )
  }
  if (ids.length > 500) {
    return NextResponse.json(
      { ok: false, error: 'max 500 match_ids per call' },
      { status: 400 },
    )
  }
  const validIds = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x))
  if (validIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'no valid UUIDs у match_ids' },
      { status: 400 },
    )
  }

  const update: Record<string, unknown> = {
    apify_review_status: status,
    apify_reviewed_at: status === 'pending' ? null : new Date().toISOString(),
    apify_reviewed_by: status === 'pending' ? null : user.email ?? user.id,
  }

  const { error, count } = await supabase
    .from('matches')
    .update(update, { count: 'exact' })
    .in('id', validIds)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status, updated: count ?? validIds.length })
}
