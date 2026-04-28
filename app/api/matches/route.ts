// app/api/matches/route.ts
// GET /api/matches?{client_id|prospect_id|product_id}=<uuid>&limit=20
// Returns: { ok, data: EnrichedMatch[] }
// Sort: algo_score DESC.
//
// Shape Per-key:
//   client_id / prospect_id provided → list of products matched (joined from products table)
//   product_id provided → mixed list з target_type='client'|'prospect' + target_name

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 200

interface MatchRow {
  id: string
  client_id: string | null
  prospect_id: string | null
  product_id: string
  algo_score: number
  subscore_breakdown: unknown
  reason_codes: string[]
  loyalty_multiplier: number
  computed_at: string
  expires_at: string
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  const url = new URL(req.url)
  const clientId = url.searchParams.get('client_id')
  const prospectId = url.searchParams.get('prospect_id')
  const productId = url.searchParams.get('product_id')
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? '', 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  )

  const provided = [clientId, prospectId, productId].filter(Boolean).length
  if (provided !== 1) {
    return NextResponse.json(
      { ok: false, error: 'Wymagany dokładnie jeden: client_id, prospect_id LUB product_id' },
      { status: 400 },
    )
  }

  if (clientId) return await listForTarget(supabase, 'client', clientId, limit)
  if (prospectId) return await listForTarget(supabase, 'prospect', prospectId, limit)
  if (productId) return await listForProduct(supabase, productId, limit)

  return NextResponse.json({ ok: false, error: 'unreachable' }, { status: 500 })
}

async function listForTarget(
  supabase: Awaited<ReturnType<typeof createClient>>,
  type: 'client' | 'prospect',
  targetId: string,
  limit: number,
): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) {
    return NextResponse.json({ ok: false, error: 'Niepoprawny UUID' }, { status: 400 })
  }
  const filterCol = type === 'client' ? 'client_id' : 'prospect_id'
  const { data, error } = await supabase
    .from('matches')
    .select(
      'id, client_id, prospect_id, product_id, algo_score, subscore_breakdown, reason_codes, loyalty_multiplier, computed_at, expires_at',
    )
    .eq(filterCol, targetId)
    .order('algo_score', { ascending: false })
    .limit(limit)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  const rows = (data ?? []) as MatchRow[]
  if (rows.length === 0) return NextResponse.json({ ok: true, data: [] })

  // Enrich з product info
  const productIds = Array.from(new Set(rows.map((r) => r.product_id)))
  const { data: products } = await supabase
    .from('products')
    .select(
      'id, name, brand, gramatura, hygiene_status, family_id, category',
    )
    .in('id', productIds)
  const productMap = new Map<string, Record<string, unknown>>(
    ((products ?? []) as Array<Record<string, unknown> & { id: string }>).map((p) => [p.id, p]),
  )

  const enriched = rows.map((r) => ({
    ...r,
    product: productMap.get(r.product_id) ?? null,
  }))
  return NextResponse.json({ ok: true, data: enriched })
}

async function listForProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  limit: number,
): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) {
    return NextResponse.json({ ok: false, error: 'Niepoprawny UUID' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('matches')
    .select(
      'id, client_id, prospect_id, product_id, algo_score, subscore_breakdown, reason_codes, loyalty_multiplier, computed_at, expires_at',
    )
    .eq('product_id', productId)
    .order('algo_score', { ascending: false })
    .limit(limit)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  const rows = (data ?? []) as MatchRow[]
  if (rows.length === 0) return NextResponse.json({ ok: true, data: [] })

  // Split into clients + prospects, batch fetch
  const clientIds = rows.filter((r) => r.client_id).map((r) => r.client_id as string)
  const prospectIds = rows.filter((r) => r.prospect_id).map((r) => r.prospect_id as string)

  const [clientsRes, prospectsRes] = await Promise.all([
    clientIds.length > 0
      ? supabase
          .from('clients')
          .select('id, title, nip, region, vat_status, gus_status, krs_legal_form')
          .in('id', clientIds)
      : Promise.resolve({ data: [] }),
    prospectIds.length > 0
      ? supabase
          .from('ceidg_prospects')
          .select('id, name, nip, wojewodztwo, vat_status, gus_status, pkd_main')
          .in('id', prospectIds)
      : Promise.resolve({ data: [] }),
  ])
  const clientMap = new Map<string, Record<string, unknown>>(
    ((clientsRes.data ?? []) as Array<Record<string, unknown> & { id: string }>).map(
      (c) => [c.id, c],
    ),
  )
  const prospectMap = new Map<string, Record<string, unknown>>(
    ((prospectsRes.data ?? []) as Array<Record<string, unknown> & { id: string }>).map(
      (p) => [p.id, p],
    ),
  )

  const enriched = rows.map((r) => {
    const isClient = r.client_id !== null
    const target = isClient
      ? clientMap.get(r.client_id as string)
      : prospectMap.get(r.prospect_id as string)
    return {
      ...r,
      target_type: isClient ? 'client' : 'prospect',
      target: target ?? null,
    }
  })

  return NextResponse.json({ ok: true, data: enriched })
}
