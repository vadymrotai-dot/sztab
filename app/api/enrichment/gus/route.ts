// app/api/enrichment/gus/route.ts
// POST { prospect_id | client_id | nip } → enrich + DB update.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enrichWithGUS, gusLogin } from '@/lib/enrichment/gus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RequestBody {
  prospect_id?: string
  client_id?: string
  nip?: string
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  let body: RequestBody = {}
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Niepoprawny JSON' }, { status: 400 })
  }

  // Read GUS API key z params
  const { data: paramsRow } = await supabase
    .from('params')
    .select('gus_api_key')
    .single()
  const gusKey = (paramsRow as { gus_api_key?: string } | null)?.gus_api_key
  if (!gusKey) {
    return NextResponse.json(
      { ok: false, error: 'Brak klucza GUS w params.gus_api_key' },
      { status: 400 },
    )
  }

  // Resolve NIP
  let nip: string | null = null
  let target: 'prospect' | 'client' | null = null
  let targetId: string | null = null

  if (body.prospect_id) {
    const { data, error } = await supabase
      .from('ceidg_prospects')
      .select('id, nip')
      .eq('id', body.prospect_id)
      .single()
    if (error || !data) {
      return NextResponse.json({ ok: false, error: 'Prospect not found' }, { status: 404 })
    }
    nip = data.nip ?? null
    target = 'prospect'
    targetId = data.id
  } else if (body.client_id) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, nip')
      .eq('id', body.client_id)
      .single()
    if (error || !data) {
      return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 })
    }
    nip = data.nip ?? null
    target = 'client'
    targetId = data.id
  } else if (body.nip) {
    nip = body.nip
  } else {
    return NextResponse.json(
      { ok: false, error: 'Wymagany jeden z: prospect_id, client_id, nip' },
      { status: 400 },
    )
  }

  if (!nip) {
    return NextResponse.json(
      { ok: false, error: 'Rekord nie ma NIP' },
      { status: 400 },
    )
  }

  const cleanNip = nip.replace(/\D/g, '')
  if (cleanNip.length !== 10) {
    return NextResponse.json(
      { ok: false, error: `Niepoprawny format NIP: "${nip}"` },
      { status: 400 },
    )
  }

  let data
  try {
    const sessionId = await gusLogin(gusKey)
    data = await enrichWithGUS(sessionId, cleanNip)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[GUS] enrichment failed nip=${cleanNip}:`, message)
    return NextResponse.json(
      { ok: false, error: `GUS API błąd: ${message.slice(0, 200)}` },
      { status: 502 },
    )
  }

  // Update DB
  if (target && targetId) {
    const tableName = target === 'prospect' ? 'ceidg_prospects' : 'clients'
    const { error: upErr } = await supabase
      .from(tableName)
      .update({
        gus_data: data.raw,
        gus_legal_name: data.legal_name,
        gus_regon: data.regon,
        gus_status: data.status,
        registered_date: data.registered_date,
        employee_count_range: data.employee_count_range,
        pkd_codes: data.pkd_codes,
        gus_last_checked: data.checked_at,
      })
      .eq('id', targetId)
    if (upErr) {
      return NextResponse.json(
        { ok: false, error: `DB update failed: ${upErr.message}` },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({ ok: true, data })
}
