// app/api/enrichment/vat/route.ts
// POST endpoint dla single-record VAT enrichment.
//
// Request body (one of):
//   { prospect_id: "uuid" }   → reads NIP from ceidg_prospects, updates same row
//   { client_id: "uuid" }     → reads NIP from clients, updates same row
//   { nip: "1234567890" }     → ad-hoc lookup, no DB write (just returns data)
//
// Response: { ok: true, data: VATData } | { ok: false, error: string }

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enrichWithVAT, normalizeNip, isValidNip } from '@/lib/enrichment/vat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

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

  // Resolve NIP — z prospect_id, client_id, or direct nip
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
      return NextResponse.json(
        { ok: false, error: `Prospect not found: ${body.prospect_id}` },
        { status: 404 },
      )
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
      return NextResponse.json(
        { ok: false, error: `Client not found: ${body.client_id}` },
        { status: 404 },
      )
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
      { ok: false, error: 'Rekord nie ma NIP — nie można wzbogacić z VAT' },
      { status: 400 },
    )
  }

  const cleanNip = normalizeNip(nip)
  if (!isValidNip(cleanNip)) {
    return NextResponse.json(
      { ok: false, error: `Niepoprawny format NIP: "${nip}"` },
      { status: 400 },
    )
  }

  // Fetch from VAT API
  let vatData
  try {
    vatData = await enrichWithVAT(cleanNip)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[VAT] enrichment failed for nip=${cleanNip}:`, message)
    return NextResponse.json(
      { ok: false, error: `VAT API błąd: ${message.slice(0, 200)}` },
      { status: 502 },
    )
  }

  // Update DB if target record specified
  if (target && targetId) {
    const tableName = target === 'prospect' ? 'ceidg_prospects' : 'clients'
    const { error: upErr } = await supabase
      .from(tableName)
      .update({
        vat_data: vatData.raw,
        vat_status: vatData.status,
        vat_registered_date: vatData.registered_date,
        vat_bank_accounts: vatData.bank_accounts,
        vat_last_checked: vatData.checked_at,
      })
      .eq('id', targetId)
    if (upErr) {
      console.error(`[VAT] DB update failed (${target}=${targetId}):`, upErr.message)
      return NextResponse.json(
        { ok: false, error: `Zapis do DB nie powiódł się: ${upErr.message}` },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({ ok: true, data: vatData })
}
