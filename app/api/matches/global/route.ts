// app/api/matches/global/route.ts
// GET /api/matches/global?target_type=&min_score=50&limit=100
// TOP-N global view — Pikniko handoff dashboard.
//
// target_type: 'client' | 'prospect' | undefined (default = all)
// min_score: 0-100 (default 50)
// limit: 1-500 (default 100)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

interface MatchRow {
  id: string
  client_id: string | null
  prospect_id: string | null
  product_id: string
  algo_score: number
  ai_score: number | null
  ai_reasoning: string | null
  ai_confidence: number | null
  ai_scored_at: string | null
  combined_score: number
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
  const targetType = url.searchParams.get('target_type')
  const minScore = Math.max(parseInt(url.searchParams.get('min_score') ?? '50', 10) || 50, 0)
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '', 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  )
  const aiOnly = url.searchParams.get('ai_only') === 'true'

  // Sprint G — sort by combined_score (ai_score wins коли non-null, else algo_score)
  let query = supabase
    .from('matches')
    .select(
      'id, client_id, prospect_id, product_id, algo_score, ai_score, ai_reasoning, ai_confidence, ai_scored_at, combined_score, subscore_breakdown, reason_codes, loyalty_multiplier, computed_at, expires_at',
    )
    .gte('combined_score', minScore)
    .order('combined_score', { ascending: false })
    .limit(limit)

  if (targetType === 'client') {
    query = query.not('client_id', 'is', null)
  } else if (targetType === 'prospect') {
    query = query.not('prospect_id', 'is', null)
  }

  if (aiOnly) {
    query = query.not('ai_score', 'is', null)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  const rows = (data ?? []) as MatchRow[]
  if (rows.length === 0) return NextResponse.json({ ok: true, data: [] })

  // Enrich з products + clients + prospects
  const productIds = Array.from(new Set(rows.map((r) => r.product_id)))
  const clientIds = Array.from(
    new Set(rows.filter((r) => r.client_id).map((r) => r.client_id as string)),
  )
  const prospectIds = Array.from(
    new Set(rows.filter((r) => r.prospect_id).map((r) => r.prospect_id as string)),
  )

  const [productsRes, clientsRes, prospectsRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, brand, gramatura, family_id, hygiene_status')
      .in('id', productIds),
    clientIds.length > 0
      ? supabase
          .from('clients')
          .select('id, title, nip, region, krs_legal_form')
          .in('id', clientIds)
      : Promise.resolve({ data: [] }),
    prospectIds.length > 0
      ? supabase
          .from('ceidg_prospects')
          .select('id, name, nip, wojewodztwo, pkd_main')
          .in('id', prospectIds)
      : Promise.resolve({ data: [] }),
  ])
  const productMap = new Map<string, Record<string, unknown>>(
    ((productsRes.data ?? []) as Array<Record<string, unknown> & { id: string }>).map(
      (p) => [p.id, p],
    ),
  )
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

  // Fetch contact_enrichment per target (latest success)
  const [contactsClientRes, contactsProspectRes] = await Promise.all([
    clientIds.length > 0
      ? supabase
          .from('contact_enrichment')
          .select('target_type, target_id, phone, email, website, status')
          .eq('target_type', 'client')
          .in('target_id', clientIds)
          .eq('status', 'success')
      : Promise.resolve({ data: [] }),
    prospectIds.length > 0
      ? supabase
          .from('contact_enrichment')
          .select('target_type, target_id, phone, email, website, status')
          .eq('target_type', 'prospect')
          .in('target_id', prospectIds)
          .eq('status', 'success')
      : Promise.resolve({ data: [] }),
  ])
  const contactMap = new Map<string, { phone: string | null; email: string | null; website: string | null }>()
  for (const c of [
    ...((contactsClientRes.data ?? []) as Array<{ target_type: string; target_id: string; phone: string | null; email: string | null; website: string | null }>),
    ...((contactsProspectRes.data ?? []) as Array<{ target_type: string; target_id: string; phone: string | null; email: string | null; website: string | null }>),
  ]) {
    contactMap.set(`${c.target_type}:${c.target_id}`, {
      phone: c.phone,
      email: c.email,
      website: c.website,
    })
  }

  const enriched = rows.map((r) => {
    const isClient = r.client_id !== null
    const target = isClient
      ? clientMap.get(r.client_id as string)
      : prospectMap.get(r.prospect_id as string)
    const targetType: 'client' | 'prospect' = isClient ? 'client' : 'prospect'
    const targetId = (isClient ? r.client_id : r.prospect_id) as string
    return {
      ...r,
      target_type: targetType,
      target: target ?? null,
      product: productMap.get(r.product_id) ?? null,
      contact: contactMap.get(`${targetType}:${targetId}`) ?? null,
    }
  })

  // Stats: how many enriched (≥1 contact field)
  const enrichedCount = enriched.filter(
    (r) => r.contact && (r.contact.phone || r.contact.email || r.contact.website),
  ).length

  return NextResponse.json({
    ok: true,
    data: enriched,
    meta: { count: enriched.length, enriched_count: enrichedCount, min_score: minScore },
  })
}
