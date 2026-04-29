// scripts/sprint-m-trigger-krs-kozak.ts
// Sprint M FIX 8 — manually trigger KRS lookup для KOZAK OLEK to populate
// krs_management_board + auto-create persons (test FIX 8).

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'
import { enrichWithKRS } from '@/lib/enrichment/krs'
import { upsertFields } from '@/lib/profile/merge'
import { startEnrichmentRun, finishEnrichmentRun } from '@/lib/profile/enrichment-log'

const KOZAK_ID = 'ed4e12e5-e432-48f2-ba74-af930171a884'
const KOZAK_KRS = '0000977768'

async function main() {
  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('Fetching KRS for KOZAK OLEK...')
  const krs = await enrichWithKRS(KOZAK_KRS)
  console.log(`Legal form: ${krs.legal_form}`)
  console.log(`Status: ${krs.status}`)
  console.log(`Management board members: ${krs.management_board?.length ?? 0}`)
  console.log(JSON.stringify(krs.management_board, null, 2))

  const fields: Array<{ field_key: string; value: { value_text?: string; value_json?: unknown } }> = []
  if (krs.full_name) fields.push({ field_key: 'krs_full_name', value: { value_text: krs.full_name } })
  if (krs.legal_form) fields.push({ field_key: 'legal_form', value: { value_text: krs.legal_form } })
  if (krs.registration_date) fields.push({ field_key: 'krs_registration_date', value: { value_text: krs.registration_date } })
  if (krs.status) fields.push({ field_key: 'krs_status', value: { value_text: krs.status } })
  if (krs.management_board && krs.management_board.length > 0)
    fields.push({ field_key: 'krs_management_board', value: { value_json: krs.management_board } })
  if (krs.pkd_with_descriptions && krs.pkd_with_descriptions.length > 0)
    fields.push({ field_key: 'krs_pkd_with_descriptions', value: { value_json: krs.pkd_with_descriptions } })
  if (krs.capital) fields.push({ field_key: 'capital', value: { value_json: krs.capital } })

  const runId = await startEnrichmentRun(supabase, {
    target_type: 'company',
    target_id: KOZAK_ID,
    source: 'KRS',
  })
  const merged = await upsertFields(
    supabase,
    { type: 'client', id: KOZAK_ID },
    fields,
    'KRS',
  )

  await supabase
    .from('clients')
    .update({
      krs_data: krs.raw,
      krs_full_name: krs.full_name,
      krs_legal_form: krs.legal_form,
      krs_registration_date: krs.registration_date,
      krs_status: krs.status,
      krs_management_board: krs.management_board,
      krs_pkd_with_descriptions: krs.pkd_with_descriptions,
      krs_last_checked: krs.checked_at,
    })
    .eq('id', KOZAK_ID)

  await finishEnrichmentRun(supabase, runId, {
    status: 'success',
    fields_added: merged.added,
    fields_updated: merged.updated,
    fields_unchanged: merged.unchanged,
    raw_payload: krs.raw,
  })

  console.log(`\n✅ KRS persisted: ${merged.added.length} added, ${merged.updated.length} updated`)

  if (Array.isArray(krs.management_board)) {
    let created = 0
    for (const member of krs.management_board) {
      const m = member as {
        function?: string | null
        index?: number
        name?: string
        surname?: string
        functionName?: string
        funkcjaWOrganie?: string
      }
      const rola = m.funkcjaWOrganie ?? m.functionName ?? m.function ?? 'Członek Zarządu'
      const explicitName = [m.name, m.surname].filter(Boolean).join(' ').trim()
      let imie: string
      let nazwisko: string
      if (explicitName) {
        const parts = explicitName.split(/\s+/)
        imie = parts[0] ?? ''
        nazwisko = parts.slice(1).join(' ') || '?'
      } else {
        imie = '(KRS anon)'
        nazwisko = `${rola} ${m.index ?? ''}`.trim()
      }

      const { data: existing } = await supabase
        .from('person_company_links')
        .select('id')
        .eq('client_id', KOZAK_ID)
        .ilike('rola', rola)
      if (existing && existing.length > 0) continue

      const { data: ins } = await supabase
        .from('persons')
        .insert({ imie, nazwisko, zrodla_pol: { rola: 'KRS', imie: 'KRS', nazwisko: 'KRS' } })
        .select('id')
        .single()
      if (ins) {
        await supabase.from('person_company_links').insert({
          person_id: (ins as { id: string }).id,
          client_id: KOZAK_ID,
          rola,
          jest_decyzyjny: rola.toLowerCase().includes('prezes') || rola.toLowerCase().includes('zarząd'),
          zrodlo: 'KRS',
        })
        created++
      }
    }
    console.log(`✅ Persons created: ${created}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
