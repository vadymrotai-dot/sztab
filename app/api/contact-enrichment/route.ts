// app/api/contact-enrichment/route.ts
// GET ?target_type=&target_id= → latest successful enrichment for target.
// Returns null якщо no enrichment yet.

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
  const targetType = url.searchParams.get('target_type')
  const targetId = url.searchParams.get('target_id')
  if (!targetType || (targetType !== 'client' && targetType !== 'prospect')) {
    return NextResponse.json(
      { ok: false, error: 'target_type required (client|prospect)' },
      { status: 400 },
    )
  }
  if (!targetId || !/^[0-9a-f-]{36}$/i.test(targetId)) {
    return NextResponse.json({ ok: false, error: 'Niepoprawny target_id (UUID)' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('contact_enrichment')
    .select(
      'id, source, phone, email, website, gmaps_url, gmaps_rating, gmaps_reviews_count, status, enriched_at, expires_at',
    )
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('status', 'success')
    .order('enriched_at', { ascending: false })
    .limit(1)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const row = (data ?? [])[0] ?? null
  return NextResponse.json({ ok: true, data: row })
}
