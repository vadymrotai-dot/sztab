// app/api/prospects/add-to-clients/route.ts
// Bulk insert prospects → clients table.
//
// POST { prospect_ids: string[] }
// → { added: number, skipped_duplicates: number, errors: string[] }
//
// Logic:
//   1. Validate auth + body
//   2. Fetch prospects by IDs (RLS auto-scopes)
//   3. Pre-check NIP duplicates (clients.nip nie ma UNIQUE constraint —
//      manual filter zamiast ON CONFLICT)
//   4. Map prospect → client insert shape (segment z dominant_channel,
//      notes auto-generated z meta_score + chain_brand)
//   5. Bulk insert z owner_id = current user
//
// Idempotent po NIP: powtórne call dla tych samych prospects pominie
// wszystkie jako duplikaty. Prospects bez NIP zawsze tworzą nowy
// client (potencjalne duplikaty na imię — operator musi dosprawdzić).

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  prospect_ids?: unknown
}

interface ProspectRecord {
  id: string
  name: string
  nip: string | null
  regon: string | null
  email: string | null
  telefon: string | null
  miejscowosc: string | null
  adres_full: string | null
  wojewodztwo: string | null
  pkd_main: string | null
  ceidg_id: string
}

interface ScoreRecord {
  prospect_id: string
  horeca_meta_score: number | string | null
  dominant_channel: string | null
  chain_brand: string | null
}

type ClientSegment = 'maly' | 'sredni' | 'duzy' | 'duzi_gracze' | 'niesklasyfikowany'

// Vadym mapping (Promt 3 spec). client.segment enum constraints to
// 'maly' | 'sredni' | 'duzy' | 'duzi_gracze' | 'niesklasyfikowany'
// (vide lib/types.ts) — używamy tych wartości; Vadym's '_opt' suffix
// był confusion z product price tier (price_maly_opt). Mapping:
//   sklep / restaurant / cafe → 'maly'   (default sklep tier)
//   catering / multi          → 'sredni' (większy potencjał obrotów)
function channelToSegment(channel: string | null): ClientSegment {
  switch (channel) {
    case 'sklep':
    case 'restaurant':
    case 'cafe':
      return 'maly'
    case 'catering':
    case 'multi':
      return 'sredni'
    default:
      return 'niesklasyfikowany'
  }
}

function buildNotes(
  prospect: ProspectRecord,
  score: ScoreRecord | null,
): string {
  const parts: string[] = ['Z CEIDG.']
  if (score?.horeca_meta_score !== null && score?.horeca_meta_score !== undefined) {
    const meta =
      typeof score.horeca_meta_score === 'number'
        ? score.horeca_meta_score
        : Number.parseFloat(String(score.horeca_meta_score))
    if (Number.isFinite(meta)) {
      const ch = score.dominant_channel ?? 'unknown'
      parts.push(`Score: ${meta.toFixed(0)}/100 (${ch}).`)
    }
  }
  if (prospect.pkd_main) parts.push(`PKD: ${prospect.pkd_main}.`)
  if (score?.chain_brand) parts.push(`[Franczyza ${score.chain_brand}]`)
  return parts.join(' ')
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Nieautoryzowany' },
      { status: 401 },
    )
  }

  let body: RequestBody = {}
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json(
      { error: 'Niepoprawny JSON' },
      { status: 400 },
    )
  }

  const ids = Array.isArray(body.prospect_ids)
    ? (body.prospect_ids.filter((x) => typeof x === 'string') as string[])
    : []
  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'Brak prospect_ids' },
      { status: 400 },
    )
  }

  // 1. Fetch prospects
  const { data: prospects, error: pErr } = await supabase
    .from('ceidg_prospects')
    .select(
      'id,name,nip,regon,email,telefon,miejscowosc,adres_full,wojewodztwo,pkd_main,ceidg_id',
    )
    .in('id', ids)
  if (pErr) {
    return NextResponse.json(
      { error: `Błąd odczytu prospektów: ${pErr.message}` },
      { status: 500 },
    )
  }
  const prospectRows = (prospects ?? []) as ProspectRecord[]

  // 2. Fetch scores for those prospects (separate table)
  const { data: scores } = await supabase
    .from('ceidg_prospect_scores')
    .select('prospect_id,horeca_meta_score,dominant_channel,chain_brand')
    .in('prospect_id', ids)
    .eq('scoring_version', 'v1')
  const scoreMap = new Map<string, ScoreRecord>(
    ((scores ?? []) as ScoreRecord[]).map((s) => [s.prospect_id, s]),
  )

  // 3. Pre-check NIP duplicates in clients (clients.nip not UNIQUE,
  //    manual filter)
  const nips = prospectRows.map((p) => p.nip).filter((n): n is string => !!n)
  const duplicateNipSet = new Set<string>()
  if (nips.length > 0) {
    const { data: existingClients } = await supabase
      .from('clients')
      .select('nip')
      .in('nip', nips)
    for (const c of existingClients ?? []) {
      if (c.nip) duplicateNipSet.add(c.nip as string)
    }
  }

  // 4. Build insert payload (filter out duplicates)
  const insertRows: Array<{
    title: string
    nip: string | null
    email: string | null
    phone: string | null
    city: string | null
    address: string | null
    region: string | null
    segment: ClientSegment
    status: string
    notes: string
    owner_id: string
  }> = []
  let skipped = 0

  for (const p of prospectRows) {
    if (p.nip && duplicateNipSet.has(p.nip)) {
      skipped += 1
      continue
    }
    const score = scoreMap.get(p.id) ?? null
    insertRows.push({
      title: p.name,
      nip: p.nip,
      email: p.email,
      phone: p.telefon,
      city: p.miejscowosc,
      address: p.adres_full,
      region: p.wojewodztwo ? p.wojewodztwo.toLowerCase() : null,
      segment: channelToSegment(score?.dominant_channel ?? null),
      status: 'nowy',
      notes: buildNotes(p, score),
      owner_id: user.id,
    })
  }

  // 5. Bulk insert
  let added = 0
  if (insertRows.length > 0) {
    const { error: insErr, data: inserted } = await supabase
      .from('clients')
      .insert(insertRows)
      .select('id')
    if (insErr) {
      return NextResponse.json(
        { error: `Błąd insertu: ${insErr.message}` },
        { status: 500 },
      )
    }
    added = inserted?.length ?? 0
  }

  return NextResponse.json({
    added,
    skipped_duplicates: skipped,
    errors: [],
  })
}
