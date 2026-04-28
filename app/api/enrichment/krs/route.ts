// app/api/enrichment/krs/route.ts
// POST { prospect_id | client_id } → enrich + DB update.
// Requires krs_number column populated (from migration 022 or manual set).

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enrichWithKRS, KrsNotFoundError } from '@/lib/enrichment/krs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface RequestBody {
  prospect_id?: string
  client_id?: string
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

  let target: 'prospect' | 'client'
  let targetId: string
  let krsNumber: string | null

  if (body.prospect_id) {
    const { data, error } = await supabase
      .from('ceidg_prospects')
      .select('id, krs_number')
      .eq('id', body.prospect_id)
      .single()
    if (error || !data) {
      return NextResponse.json({ ok: false, error: 'Prospect not found' }, { status: 404 })
    }
    target = 'prospect'
    targetId = data.id
    krsNumber = (data as { krs_number: string | null }).krs_number
  } else if (body.client_id) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, krs_number')
      .eq('id', body.client_id)
      .single()
    if (error || !data) {
      return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 })
    }
    target = 'client'
    targetId = data.id
    krsNumber = (data as { krs_number: string | null }).krs_number
  } else {
    return NextResponse.json(
      { ok: false, error: 'Wymagany jeden z: prospect_id, client_id' },
      { status: 400 },
    )
  }

  if (!krsNumber) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Brak numeru KRS — ten podmiot to JDG lub nie zwrócony przez GUS. Najpierw uruchom enrichment GUS.',
      },
      { status: 400 },
    )
  }

  let data
  try {
    data = await enrichWithKRS(krsNumber)
  } catch (err) {
    if (err instanceof KrsNotFoundError) {
      return NextResponse.json(
        { ok: false, error: `KRS ${krsNumber} nie znaleziony w rejestrach P ani S` },
        { status: 404 },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[KRS] enrichment failed krs=${krsNumber}:`, message)
    return NextResponse.json(
      { ok: false, error: `KRS API błąd: ${message.slice(0, 200)}` },
      { status: 502 },
    )
  }

  const tableName = target === 'prospect' ? 'ceidg_prospects' : 'clients'
  const { error: upErr } = await supabase
    .from(tableName)
    .update({
      krs_data: data.raw,
      krs_full_name: data.full_name,
      krs_legal_form: data.legal_form,
      krs_registration_date: data.registration_date,
      krs_management_board: data.management_board,
      krs_pkd_with_descriptions: data.pkd_with_descriptions,
      krs_status: data.status,
      krs_last_checked: data.checked_at,
    })
    .eq('id', targetId)
  if (upErr) {
    return NextResponse.json(
      { ok: false, error: `DB update failed: ${upErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, data })
}
