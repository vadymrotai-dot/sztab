// app/api/taxonomy/families/route.ts
// GET /api/taxonomy/families?segment_id=<uuid>
//   - segment_id required → returns families for that segment
// Read-only API цей sprint.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  const url = new URL(req.url)
  const segmentId = url.searchParams.get('segment_id')

  let query = supabase
    .from('taxonomy_families')
    .select('id, segment_id, name_pl, name_en, ord, required_attributes, validation_rules')
    .order('ord', { ascending: true })

  if (segmentId) {
    if (!/^[0-9a-f-]{36}$/i.test(segmentId)) {
      return NextResponse.json(
        { ok: false, error: 'Niepoprawny segment_id (oczekiwany UUID)' },
        { status: 400 },
      )
    }
    query = query.eq('segment_id', segmentId)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, data: data ?? [] })
}
