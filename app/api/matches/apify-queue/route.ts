// app/api/matches/apify-queue/route.ts
// GET — pre-Apify review queue.
//
// Sprint I Layer 1 hard filters (computed inline, not stored):
//   • combined_score >= 70
//   • PKD HoReCa (first 2 digits ∈ {47,56,10,11,46}):
//     - clients: any code in pkd_2007_codes
//     - prospects: pkd_main starts з one of цих prefixes
//   • Status active:
//     - clients: vat_status ILIKE 'czynny'
//     - prospects: ceidg status = 'AKTYWNY'
//   • NIP not null + non-empty
//   • City not null + non-empty (clients.city OR prospects.miejscowosc)
//   • Registered_date NULL OR < NOW() - 6 months (clients.registered_date,
//     prospects.data_rozpoczecia)
//
// Returns TOP-N з apify_review_status flag + also_in_other_table.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { findExistingContact } from '@/lib/enrichment/contact-preflight'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HORECA_DIVISIONS = ['47', '56', '10', '11', '46']
const SIX_MONTHS_AGO = () => {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString()
}

interface MatchRow {
  id: string
  client_id: string | null
  prospect_id: string | null
  product_id: string
  combined_score: number
  algo_score: number
  ai_score: number | null
  ai_reasoning: string | null
  reason_codes: string[]
  apify_review_status: 'pending' | 'approved' | 'skipped'
  apify_reviewed_at: string | null
  apify_reviewed_by: string | null
}

interface ClientLite {
  id: string
  title: string
  nip: string | null
  city: string | null
  region: string | null
  vat_status: string | null
  pkd_2007_codes: string[] | null
  registered_date: string | null
}

interface ProspectLite {
  id: string
  name: string
  nip: string | null
  miejscowosc: string | null
  wojewodztwo: string | null
  vat_status: string | null
  status: string | null
  pkd_main: string | null
  pkd_all: string[] | null
  data_rozpoczecia: string | null
}

function passesEligibility(args: {
  type: 'client' | 'prospect'
  client?: ClientLite | null
  prospect?: ProspectLite | null
}): boolean {
  const { type, client, prospect } = args
  const sixMonthsAgo = SIX_MONTHS_AGO()

  if (type === 'client') {
    if (!client) return false
    if (!client.nip || client.nip.trim() === '') return false
    if (!client.city || client.city.trim() === '') return false
    if ((client.vat_status ?? '').toLowerCase() !== 'czynny') return false
    const codes = client.pkd_2007_codes ?? []
    const hasHoreca = codes.some((c) => HORECA_DIVISIONS.includes(c.slice(0, 2)))
    if (!hasHoreca) return false
    if (client.registered_date && client.registered_date >= sixMonthsAgo) return false
    return true
  } else {
    if (!prospect) return false
    if (!prospect.nip || prospect.nip.trim() === '') return false
    if (!prospect.miejscowosc || prospect.miejscowosc.trim() === '') return false
    if (prospect.status !== 'AKTYWNY') return false
    const main = prospect.pkd_main ?? ''
    if (!HORECA_DIVISIONS.includes(main.slice(0, 2))) return false
    if (prospect.data_rozpoczecia && prospect.data_rozpoczecia >= sixMonthsAgo) return false
    return true
  }
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
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 200)

  // Pull score-gated matches, then app-side eligibility filter
  const POOL_MULTIPLIER = 10
  const { data: matchRows, error: mErr } = await supabase
    .from('matches')
    .select(
      'id, client_id, prospect_id, product_id, combined_score, algo_score, ai_score, ai_reasoning, reason_codes, apify_review_status, apify_reviewed_at, apify_reviewed_by, is_primary_for_target',
    )
    .gte('combined_score', 70)
    .eq('is_primary_for_target', true) // Sprint J: dedup за target
    .order('combined_score', { ascending: false })
    .limit(limit * POOL_MULTIPLIER)
  if (mErr) {
    return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 })
  }
  const matches = (matchRows ?? []) as MatchRow[]

  // Resolve targets + products
  const clientIds = Array.from(
    new Set(matches.filter((m) => m.client_id).map((m) => m.client_id as string)),
  )
  const prospectIds = Array.from(
    new Set(matches.filter((m) => m.prospect_id).map((m) => m.prospect_id as string)),
  )
  const productIds = Array.from(new Set(matches.map((m) => m.product_id)))

  const [clientsRes, prospectsRes, productsRes, allClientsByNipRes, allProspectsByNipRes] =
    await Promise.all([
      clientIds.length > 0
        ? supabase
            .from('clients')
            .select('id, title, nip, city, region, vat_status, pkd_2007_codes, registered_date')
            .in('id', clientIds)
        : Promise.resolve({ data: [] }),
      prospectIds.length > 0
        ? supabase
            .from('ceidg_prospects')
            .select('id, name, nip, miejscowosc, wojewodztwo, vat_status, status, pkd_main, pkd_all, data_rozpoczecia')
            .in('id', prospectIds)
        : Promise.resolve({ data: [] }),
      productIds.length > 0
        ? supabase.from('products').select('id, name, brand').in('id', productIds)
        : Promise.resolve({ data: [] }),
      supabase.from('clients').select('nip').not('nip', 'is', null),
      supabase.from('ceidg_prospects').select('nip').not('nip', 'is', null),
    ])

  const clientMap = new Map<string, ClientLite>(
    ((clientsRes.data ?? []) as ClientLite[]).map((c) => [c.id, c]),
  )
  const prospectMap = new Map<string, ProspectLite>(
    ((prospectsRes.data ?? []) as ProspectLite[]).map((p) => [p.id, p]),
  )
  const productMap = new Map<string, { name: string; brand: string | null }>(
    ((productsRes.data ?? []) as Array<{ id: string; name: string; brand: string | null }>).map(
      (p) => [p.id, p],
    ),
  )

  const clientNips = new Set<string>(
    ((allClientsByNipRes.data ?? []) as Array<{ nip: string }>).map((r) =>
      r.nip.replace(/\D/g, ''),
    ),
  )
  const prospectNips = new Set<string>(
    ((allProspectsByNipRes.data ?? []) as Array<{ nip: string }>).map((r) =>
      r.nip.replace(/\D/g, ''),
    ),
  )

  // Filter eligible + build response
  const eligible: Array<{
    match_id: string
    target_type: 'client' | 'prospect'
    target_id: string
    target_name: string
    nip: string
    pkd: string[]
    city: string
    combined_score: number
    algo_score: number
    ai_score: number | null
    ai_reasoning: string | null
    reason_codes: string[]
    product_name: string
    product_brand: string | null
    also_in_other_table: boolean
    apify_review_status: 'pending' | 'approved' | 'skipped'
    apify_reviewed_at: string | null
    apify_reviewed_by: string | null
    existing_contact: {
      phone: string | null
      email: string | null
      website: string | null
      source: 'clients' | 'ceidg_prospects' | 'contact_enrichment'
    } | null
  }> = []

  for (const m of matches) {
    if (m.client_id) {
      const c = clientMap.get(m.client_id)
      if (!c || !passesEligibility({ type: 'client', client: c })) continue
      const cleanNip = (c.nip ?? '').replace(/\D/g, '')
      const existingContact = await findExistingContact(supabase, 'client', c.id)
      eligible.push({
        existing_contact: existingContact,
        match_id: m.id,
        target_type: 'client',
        target_id: c.id,
        target_name: c.title,
        nip: cleanNip,
        pkd: c.pkd_2007_codes ?? [],
        city: c.city ?? c.region ?? '',
        combined_score: m.combined_score,
        algo_score: m.algo_score,
        ai_score: m.ai_score,
        ai_reasoning: m.ai_reasoning,
        reason_codes: m.reason_codes,
        product_name: productMap.get(m.product_id)?.name ?? '',
        product_brand: productMap.get(m.product_id)?.brand ?? null,
        also_in_other_table: clientNips.has(cleanNip) && prospectNips.has(cleanNip),
        apify_review_status: m.apify_review_status,
        apify_reviewed_at: m.apify_reviewed_at,
        apify_reviewed_by: m.apify_reviewed_by,
      })
    } else if (m.prospect_id) {
      const p = prospectMap.get(m.prospect_id)
      if (!p || !passesEligibility({ type: 'prospect', prospect: p })) continue
      const cleanNip = (p.nip ?? '').replace(/\D/g, '')
      const pkd = new Set<string>()
      if (p.pkd_main) pkd.add(p.pkd_main)
      if (p.pkd_all) for (const c of p.pkd_all) if (c) pkd.add(c)
      const existingContact = await findExistingContact(supabase, 'prospect', p.id)
      eligible.push({
        existing_contact: existingContact,
        match_id: m.id,
        target_type: 'prospect',
        target_id: p.id,
        target_name: p.name,
        nip: cleanNip,
        pkd: Array.from(pkd),
        city: p.miejscowosc ?? p.wojewodztwo ?? '',
        combined_score: m.combined_score,
        algo_score: m.algo_score,
        ai_score: m.ai_score,
        ai_reasoning: m.ai_reasoning,
        reason_codes: m.reason_codes,
        product_name: productMap.get(m.product_id)?.name ?? '',
        product_brand: productMap.get(m.product_id)?.brand ?? null,
        also_in_other_table: clientNips.has(cleanNip) && prospectNips.has(cleanNip),
        apify_review_status: m.apify_review_status,
        apify_reviewed_at: m.apify_reviewed_at,
        apify_reviewed_by: m.apify_reviewed_by,
      })
    }
    if (eligible.length >= limit) break
  }

  const counts = {
    eligible: eligible.length,
    pending: eligible.filter((e) => e.apify_review_status === 'pending').length,
    approved: eligible.filter((e) => e.apify_review_status === 'approved').length,
    skipped: eligible.filter((e) => e.apify_review_status === 'skipped').length,
    already_enriched: eligible.filter((e) => e.existing_contact !== null).length,
  }

  return NextResponse.json({ ok: true, data: eligible, counts })
}
