// app/api/taxonomy/segments/route.ts
// GET /api/taxonomy/segments — list segments sorted by ord.
// Read-only API цей sprint (CRUD UI deferred).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('taxonomy_segments')
    .select('id, name_pl, name_en, ord')
    .order('ord', { ascending: true })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, data: data ?? [] })
}
