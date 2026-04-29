// app/api/clients/bulk-update/route.ts
// Sprint P FIX 4 — bulk update tier / status from Akcje grupowe.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_FIELDS = ['size_tier', 'status', 'segment', 'channel_type'] as const
type AllowedField = (typeof ALLOWED_FIELDS)[number]

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 })

  let body: { ids?: string[]; field?: string; value?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }
  const { ids, field, value } = body
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'ids required' }, { status: 400 })
  }
  if (!field || !ALLOWED_FIELDS.includes(field as AllowedField)) {
    return NextResponse.json(
      { ok: false, error: `field must be one of ${ALLOWED_FIELDS.join(', ')}` },
      { status: 400 },
    )
  }
  if (typeof value !== 'string' || !value) {
    return NextResponse.json({ ok: false, error: 'value required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('clients')
    .update({ [field]: value })
    .in('id', ids)
    .select('id')

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, updated: (data ?? []).length })
}
