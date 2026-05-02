// scripts/diag-clients-id-500.ts
// READ-ONLY diagnose: simulate page.tsx queries dla KOZAK + DEKOB и
// znajduj який query blowed up.

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'
import { executeManagementSQL } from '@/lib/supabase/management'

const KOZAK_ID = 'ed4e12e5-e432-48f2-ba74-af930171a884'
const DEKOB_ID = '0045b455-6537-4a6c-8264-6924308bbafb'

async function checkSchema(table: string, expected: string[]) {
  const r = await executeManagementSQL(
    `SELECT column_name FROM information_schema.columns WHERE table_name='${table}' ORDER BY column_name;`,
  )
  const cols = (r.rows ?? []).map((row) => (row as { column_name: string }).column_name)
  const missing = expected.filter((c) => !cols.includes(c))
  console.log(`${table}: ${missing.length === 0 ? '✅' : '❌ missing: ' + missing.join(',')}`)
  if (missing.length > 0) console.log(`  has: ${cols.join(', ')}`)
}

async function tryQuery(label: string, fn: () => Promise<{ data: unknown; error: unknown }>) {
  try {
    const { data, error } = await fn()
    if (error) {
      console.log(`❌ ${label}: ${(error as { message?: string }).message ?? JSON.stringify(error)}`)
    } else {
      const count = Array.isArray(data) ? data.length : data ? 1 : 0
      console.log(`✅ ${label}: ${count} row(s)`)
    }
  } catch (err) {
    console.log(`💥 ${label}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function diagFor(id: string, label: string) {
  console.log(`\n━━━ Probe queries dla ${label} (${id}) ━━━`)
  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  await tryQuery('clients * .single()', () =>
    supabase.from('clients').select('*').eq('id', id).single(),
  )
  await tryQuery('contacts', () =>
    supabase.from('contacts').select('*').eq('client_id', id),
  )
  await tryQuery('deals', () => supabase.from('deals').select('*').eq('client_id', id))
  await tryQuery('tasks', () => supabase.from('tasks').select('*').eq('client_id', id))
  await tryQuery('bzp_tenders', () =>
    supabase.from('bzp_tenders').select('id, ordering_party, award_date').eq('client_id', id),
  )
  await tryQuery('financial_statements', () =>
    supabase
      .from('financial_statements')
      .select('okres_data_koniec, przychody_netto, zysk_netto, aktywa_razem, liczba_pracownikow')
      .eq('client_id', id),
  )
  await tryQuery('company_profile_fields (S2B select)', () =>
    supabase
      .from('company_profile_fields')
      .select('field_key, value_text, value_number, value_json, source')
      .eq('client_id', id)
      .is('superseded_at', null),
  )
  await tryQuery('person_company_links !inner persons', () =>
    supabase
      .from('person_company_links')
      .select(
        'rola, jest_decyzyjny, persons:persons!inner(id, imie, nazwisko, source, rejestrio_person_id)',
      )
      .eq('client_id', id)
      .is('data_do', null),
  )
  await tryQuery('person_company_links з alias singular `person`', () =>
    supabase
      .from('person_company_links')
      .select('rola, jest_decyzyjny, person:persons(id, imie, nazwisko, source, rejestrio_person_id)')
      .eq('client_id', id)
      .is('data_do', null),
  )
  await tryQuery('crbr_beneficiaries', () =>
    supabase.from('crbr_beneficiaries').select('imie, nazwisko, kraj_rezydencji, obywatelstwa').eq('client_id', id),
  )
  await tryQuery('company_branches', () =>
    supabase.from('company_branches').select('id').eq('client_id', id).eq('status', 'AKTYWNA'),
  )
  await tryQuery('matches algo_score top', () =>
    supabase.from('matches').select('algo_score').eq('client_id', id).order('algo_score', { ascending: false }).limit(1).maybeSingle(),
  )
  await tryQuery('company_profile_fields pkd_main', () =>
    supabase
      .from('company_profile_fields')
      .select('value_text, value_json')
      .eq('client_id', id)
      .eq('field_key', 'pkd_main')
      .is('superseded_at', null)
      .limit(1)
      .maybeSingle(),
  )
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('SCHEMA AUDIT')
  console.log('═══════════════════════════════════════════════════════════')
  await checkSchema('clients', [
    'id',
    'title',
    'nip',
    'entity_type',
    'bankruptcy_flag',
    'liquidation_flag',
    'restructuring_flag',
    'suspended_at',
    'branch_offices_count',
    'last_filing_date',
    'kapital_zakladowy',
    'founded_at',
    'email_krs',
    'website_krs',
    'employees_count',
    'rejestrio_org_id',
  ])
  await checkSchema('financial_statements', [
    'client_id',
    'okres_data_koniec',
    'przychody_netto',
    'zysk_netto',
    'aktywa_razem',
    'liczba_pracownikow',
  ])
  await checkSchema('crbr_beneficiaries', ['client_id', 'imie', 'nazwisko', 'kraj_rezydencji', 'obywatelstwa'])
  await checkSchema('company_branches', ['client_id', 'status'])
  await checkSchema('persons', ['imie', 'nazwisko', 'source', 'rejestrio_person_id'])
  await checkSchema('person_company_links', [
    'rola',
    'jest_decyzyjny',
    'client_id',
    'person_id',
    'data_do',
  ])
  await checkSchema('company_profile_fields', [
    'client_id',
    'field_key',
    'value_text',
    'value_number',
    'value_json',
    'source',
    'superseded_at',
  ])

  await diagFor(KOZAK_ID, 'KOZAK')
  await diagFor(DEKOB_ID, 'DEKOB')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
