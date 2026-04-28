// app/api/clients/[id]/enrich-apify/route.ts
// POST — single-client Apify lookup. Sync.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrichContactsApify } from '@/lib/enrichment/apify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(
  _req: Request,
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
    return NextResponse.json({ ok: false, error: 'Niepoprawny client id' }, { status: 400 })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, title, nip, city, region')
    .eq('id', id)
    .single()
  if (!client) {
    return NextResponse.json({ ok: false, error: 'client not found' }, { status: 404 })
  }
  const c = client as { id: string; title: string; nip: string | null; city: string | null; region: string | null }

  const { data: paramsRow } = await supabase
    .from('params')
    .select('apify_api_token')
    .limit(1)
    .maybeSingle()
  const apifyKey =
    (paramsRow as { apify_api_token?: string } | null)?.apify_api_token ?? null
  if (!apifyKey) {
    return NextResponse.json(
      { ok: false, error: 'params.apify_api_token not set' },
      { status: 500 },
    )
  }

  const result = await enrichContactsApify(apifyKey, {
    name: c.title,
    city: c.city,
    voivodeship: c.region,
    nip: c.nip,
  })

  await supabase.from('contact_enrichment').upsert(
    {
      target_type: 'client',
      target_id: c.id,
      source: 'apify_gmaps',
      phone: result.phone,
      email: result.email,
      website: result.website,
      gmaps_url: result.gmaps_url,
      gmaps_rating: result.gmaps_rating,
      gmaps_reviews_count: result.gmaps_reviews_count,
      raw_payload: result.raw_payload,
      status: result.status,
      error_message: result.error_message ?? null,
      cost_usd: result.cost_usd,
      enriched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    },
    { onConflict: 'target_type,target_id,source' },
  )

  return NextResponse.json({ ok: true, result })
}
