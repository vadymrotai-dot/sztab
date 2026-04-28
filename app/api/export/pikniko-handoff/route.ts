// app/api/export/pikniko-handoff/route.ts
// GET — Pikniko handoff CSV/JSON.
// Query: min_score=60, limit=50, format=csv|json, with_contacts_only=true
//
// Cross-table NIP dedup: pick highest-scoring match per unique NIP across
// clients + ceidg_prospects. Mark also_in_other_table=true якщо NIP існує
// в обох tables.
//
// CSV: UTF-8 з BOM (для Excel PL), comma-separated, double-quoted strings.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  sales_snippet: { opener_pl?: string } | null
}

interface ExportRow {
  nazwa: string
  nip: string
  typ: 'Klient' | 'Prospekt'
  also_in_other_table: boolean
  pkd: string
  adres: string
  telefon: string
  email: string
  strona_www: string
  top_product: string
  combined_score: number
  ai_reasoning: string
  suggested_opener: string
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  // Always double-quote, escape quotes z doubling
  return `"${s.replace(/"/g, '""')}"`
}

function buildCsv(rows: ExportRow[]): string {
  const header = [
    'Nazwa',
    'NIP',
    'Typ',
    'Also in other table',
    'PKD',
    'Adres',
    'Telefon',
    'Email',
    'Strona WWW',
    'Top Product',
    'Combined Score',
    'AI Reasoning',
    'Suggested Opener',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.nazwa),
        csvEscape(r.nip),
        csvEscape(r.typ),
        csvEscape(r.also_in_other_table ? 'tak' : 'nie'),
        csvEscape(r.pkd),
        csvEscape(r.adres),
        csvEscape(r.telefon),
        csvEscape(r.email),
        csvEscape(r.strona_www),
        csvEscape(r.top_product),
        csvEscape(r.combined_score),
        csvEscape(r.ai_reasoning),
        csvEscape(r.suggested_opener),
      ].join(','),
    )
  }
  // UTF-8 BOM dla Excel PL
  return '﻿' + lines.join('\r\n') + '\r\n'
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
  const minScore = Math.max(0, parseInt(url.searchParams.get('min_score') ?? '60', 10) || 60)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 500)
  const format = (url.searchParams.get('format') ?? 'csv') === 'json' ? 'json' : 'csv'
  const withContactsOnly = url.searchParams.get('with_contacts_only') !== 'false'

  // Pull wider pool than limit, dedup on NIP, then truncate
  const POOL_MULTIPLIER = 6
  const { data: matchRows, error: mErr } = await supabase
    .from('matches')
    .select(
      'id, client_id, prospect_id, product_id, combined_score, algo_score, ai_score, ai_reasoning, reason_codes, sales_snippet',
    )
    .gte('combined_score', minScore)
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

  const [clientsRes, prospectsRes, productsRes, allClientsByNip, allProspectsByNip] =
    await Promise.all([
      clientIds.length > 0
        ? supabase
            .from('clients')
            .select('id, title, nip, city, region, pkd_2007_codes')
            .in('id', clientIds)
        : Promise.resolve({ data: [] }),
      prospectIds.length > 0
        ? supabase
            .from('ceidg_prospects')
            .select('id, name, nip, miejscowosc, wojewodztwo, pkd_main, pkd_all')
            .in('id', prospectIds)
        : Promise.resolve({ data: [] }),
      productIds.length > 0
        ? supabase.from('products').select('id, name, brand').in('id', productIds)
        : Promise.resolve({ data: [] }),
      // Fetch all clients NIPs дla cross-table check
      supabase.from('clients').select('nip').not('nip', 'is', null),
      supabase.from('ceidg_prospects').select('nip').not('nip', 'is', null),
    ])

  const clientMap = new Map<
    string,
    { id: string; title: string; nip: string | null; city: string | null; region: string | null; pkd_2007_codes: string[] | null }
  >(
    ((clientsRes.data ?? []) as Array<{
      id: string
      title: string
      nip: string | null
      city: string | null
      region: string | null
      pkd_2007_codes: string[] | null
    }>).map((c) => [c.id, c]),
  )
  const prospectMap = new Map<
    string,
    { id: string; name: string; nip: string | null; miejscowosc: string | null; wojewodztwo: string | null; pkd_main: string | null; pkd_all: string[] | null }
  >(
    ((prospectsRes.data ?? []) as Array<{
      id: string
      name: string
      nip: string | null
      miejscowosc: string | null
      wojewodztwo: string | null
      pkd_main: string | null
      pkd_all: string[] | null
    }>).map((p) => [p.id, p]),
  )
  const productMap = new Map<string, { name: string; brand: string | null }>(
    ((productsRes.data ?? []) as Array<{ id: string; name: string; brand: string | null }>).map(
      (p) => [p.id, p],
    ),
  )

  // Cross-table NIP sets дla also_in_other_table flag
  const clientNips = new Set<string>(
    ((allClientsByNip.data ?? []) as Array<{ nip: string }>).map((r) =>
      r.nip.replace(/\D/g, ''),
    ),
  )
  const prospectNips = new Set<string>(
    ((allProspectsByNip.data ?? []) as Array<{ nip: string }>).map((r) =>
      r.nip.replace(/\D/g, ''),
    ),
  )

  // Dedup by NIP (cross-table)
  interface TargetRef {
    type: 'client' | 'prospect'
    id: string
    nip: string
    name: string
    city: string | null
    pkd: string[]
    score: number
    match_id: string
    product_id: string
    ai_reasoning: string | null
    sales_snippet: { opener_pl?: string } | null
  }

  const dedupMap = new Map<string, TargetRef>()
  for (const m of matches) {
    let ref: TargetRef | null = null
    if (m.client_id) {
      const c = clientMap.get(m.client_id)
      if (!c?.nip) continue
      const nip = c.nip.replace(/\D/g, '')
      if (!nip) continue
      ref = {
        type: 'client',
        id: c.id,
        nip,
        name: c.title,
        city: c.city ?? c.region,
        pkd: c.pkd_2007_codes ?? [],
        score: m.combined_score,
        match_id: m.id,
        product_id: m.product_id,
        ai_reasoning: m.ai_reasoning,
        sales_snippet: m.sales_snippet,
      }
    } else if (m.prospect_id) {
      const p = prospectMap.get(m.prospect_id)
      if (!p?.nip) continue
      const nip = p.nip.replace(/\D/g, '')
      if (!nip) continue
      const pkdArr = new Set<string>()
      if (p.pkd_main) pkdArr.add(p.pkd_main)
      if (p.pkd_all) for (const c of p.pkd_all) if (c) pkdArr.add(c)
      ref = {
        type: 'prospect',
        id: p.id,
        nip,
        name: p.name,
        city: p.miejscowosc ?? p.wojewodztwo,
        pkd: Array.from(pkdArr),
        score: m.combined_score,
        match_id: m.id,
        product_id: m.product_id,
        ai_reasoning: m.ai_reasoning,
        sales_snippet: m.sales_snippet,
      }
    }
    if (!ref) continue
    const existing = dedupMap.get(ref.nip)
    if (!existing || ref.score > existing.score) {
      dedupMap.set(ref.nip, ref)
    }
  }

  // Pull contact_enrichment для всіх winners
  const targetKeys = Array.from(dedupMap.values()).map((r) => ({
    target_type: r.type,
    target_id: r.id,
  }))
  // Supabase JS doesn't support tuple-IN — split per target_type
  const clientTargetIds = targetKeys
    .filter((t) => t.target_type === 'client')
    .map((t) => t.target_id)
  const prospectTargetIds = targetKeys
    .filter((t) => t.target_type === 'prospect')
    .map((t) => t.target_id)
  const [contactsClientRes, contactsProspectRes] = await Promise.all([
    clientTargetIds.length > 0
      ? supabase
          .from('contact_enrichment')
          .select('target_type, target_id, phone, email, website, status')
          .eq('target_type', 'client')
          .in('target_id', clientTargetIds)
          .eq('status', 'success')
      : Promise.resolve({ data: [] }),
    prospectTargetIds.length > 0
      ? supabase
          .from('contact_enrichment')
          .select('target_type, target_id, phone, email, website, status')
          .eq('target_type', 'prospect')
          .in('target_id', prospectTargetIds)
          .eq('status', 'success')
      : Promise.resolve({ data: [] }),
  ])
  const contactMap = new Map<string, { phone: string | null; email: string | null; website: string | null }>()
  const contactRows = [
    ...((contactsClientRes.data ?? []) as Array<{ target_type: string; target_id: string; phone: string | null; email: string | null; website: string | null }>),
    ...((contactsProspectRes.data ?? []) as Array<{ target_type: string; target_id: string; phone: string | null; email: string | null; website: string | null }>),
  ]
  for (const c of contactRows) {
    contactMap.set(`${c.target_type}:${c.target_id}`, {
      phone: c.phone,
      email: c.email,
      website: c.website,
    })
  }

  // Build export rows
  const refs = Array.from(dedupMap.values()).sort((a, b) => b.score - a.score)
  const exportRows: ExportRow[] = []
  for (const ref of refs) {
    const product = productMap.get(ref.product_id)
    const contact = contactMap.get(`${ref.type}:${ref.id}`) ?? {
      phone: null,
      email: null,
      website: null,
    }
    if (withContactsOnly && !contact.phone && !contact.email && !contact.website) {
      continue
    }
    exportRows.push({
      nazwa: ref.name,
      nip: ref.nip,
      typ: ref.type === 'client' ? 'Klient' : 'Prospekt',
      also_in_other_table:
        clientNips.has(ref.nip) && prospectNips.has(ref.nip),
      pkd: ref.pkd.slice(0, 6).join(', '),
      adres: ref.city ?? '',
      telefon: contact.phone ?? '',
      email: contact.email ?? '',
      strona_www: contact.website ?? '',
      top_product: product?.name ?? '',
      combined_score: ref.score,
      ai_reasoning: ref.ai_reasoning ?? '',
      suggested_opener: ref.sales_snippet?.opener_pl ?? '',
    })
    if (exportRows.length >= limit) break
  }

  if (format === 'json') {
    return NextResponse.json({
      ok: true,
      data: exportRows,
      meta: {
        total: exportRows.length,
        unique_nips: dedupMap.size,
        with_contacts_only: withContactsOnly,
      },
    })
  }

  const csv = buildCsv(exportRows)
  const ts = new Date()
  const filename = `pikniko-handoff-${ts.toISOString().slice(0, 10)}-${ts.toTimeString().slice(0, 5).replace(':', '')}.csv`
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
