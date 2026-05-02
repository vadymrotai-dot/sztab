// app/api/clients/[id]/krs-refresh/route.ts
// Sprint S5B-1 — focused KRS-only refresh endpoint dla "Pobierz z KRS"
// section action buttons. Calls тilko rejestr.io v2:
//   - fetchOrgBasic     → clients.rejestrio_org_id, employees_count
//   - fetchAllFinancials → financial_statements upsert per rok
//
// Faster (~20-40s) niż pełny /api/intelligence/lookup (~1-2 min) — stays
// scoped до tego, co label kuponи "z KRS" obiecuje.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchOrgBasic } from '@/lib/rejestrio/org-basic'
import { fetchAllFinancials } from '@/lib/rejestrio/sprawozdania'
import { startEnrichmentRun, finishEnrichmentRun } from '@/lib/profile/enrichment-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

  // Read client NIP + KRS
  const { data: client } = await supabase
    .from('clients')
    .select('id, nip, krs_number')
    .eq('id', id)
    .maybeSingle()
  const c = client as { id: string; nip: string | null; krs_number: string | null } | null
  if (!c) {
    return NextResponse.json({ ok: false, error: 'Klient nie istnieje' }, { status: 404 })
  }
  if (!c.krs_number) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Brak numeru KRS w tym kliencie. Uruchom "Analiza klienta" w panelu akcji powyżej — wzbogaci ona dane z KRS jeśli klient jest spółką.',
      },
      { status: 400 },
    )
  }

  // Read API token
  const { data: paramsRow } = await supabase
    .from('params')
    .select('krs_rejestr_api_token')
    .limit(1)
    .maybeSingle()
  const apiKey = (paramsRow as { krs_rejestr_api_token?: string } | null)?.krs_rejestr_api_token
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'krs_rejestr_api_token brak у /settings → Klucze API' },
      { status: 500 },
    )
  }

  const runId = await startEnrichmentRun(supabase, {
    target_type: 'company',
    target_id: id,
    source: 'KRS_refresh',
  })

  let fieldsUpdated = 0
  let sprawozdaniaAdded = 0
  const errors: string[] = []

  // 1. org-basic — rejestrio_org_id + employees_count
  try {
    const org = await fetchOrgBasic(apiKey, c.krs_number)
    if (org) {
      const updates: Record<string, unknown> = {}
      if (org.rejestrio_org_id !== null) updates.rejestrio_org_id = org.rejestrio_org_id
      if (org.employees_count !== null) updates.employees_count = org.employees_count
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from('clients').update(updates).eq('id', id)
        if (error) errors.push(`org-basic: ${error.message}`)
        else fieldsUpdated += Object.keys(updates).length
      }
    }
  } catch (e) {
    errors.push(`org-basic: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 2. sprawozdania — financial_statements upsert per rok
  try {
    const fins = await fetchAllFinancials(apiKey, c.krs_number)
    for (const f of fins) {
      const { error } = await supabase.from('financial_statements').upsert(
        {
          client_id: id,
          krs_doc_id: f.primary_doc_id,
          okres_data_start: f.okres_data_start,
          okres_data_koniec: f.okres_data_koniec,
          przychody_netto: f.fields.przychody_netto,
          zysk_netto: f.fields.zysk_netto,
          aktywa_razem: f.fields.aktywa_razem,
          liczba_pracownikow: f.fields.liczba_pracownikow,
          raw_xbrl_json: f.raw_xbrl_combined,
          source: 'rejestrio_v2',
        },
        { onConflict: 'client_id,okres_data_koniec' },
      )
      if (error) errors.push(`fin ${f.okres_data_koniec}: ${error.message}`)
      else sprawozdaniaAdded += 1
    }
  } catch (e) {
    errors.push(`sprawozdania: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Touch last_filing_date based on newest sprawozdanie
  if (sprawozdaniaAdded > 0) {
    const { data: latest } = await supabase
      .from('financial_statements')
      .select('okres_data_koniec')
      .eq('client_id', id)
      .order('okres_data_koniec', { ascending: false })
      .limit(1)
      .maybeSingle()
    const lastKoniec = (latest as { okres_data_koniec: string } | null)?.okres_data_koniec
    if (lastKoniec) {
      await supabase.from('clients').update({ last_filing_date: lastKoniec }).eq('id', id)
      fieldsUpdated += 1
    }
  }

  await finishEnrichmentRun(supabase, runId, {
    status: errors.length > 0 ? 'partial' : 'success',
    error_message: errors.length > 0 ? errors.join('; ') : undefined,
  })

  return NextResponse.json({
    ok: true,
    fields_updated: fieldsUpdated,
    sprawozdania_added: sprawozdaniaAdded,
    errors,
  })
}
