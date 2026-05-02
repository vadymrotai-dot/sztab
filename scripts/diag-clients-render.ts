// scripts/diag-clients-render.ts
// READ-ONLY repro: simulates the page server logic computations
// (post-query) to find which transformation throws.

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'

const KOZAK_ID = 'ed4e12e5-e432-48f2-ba74-af930171a884'
const DEKOB_ID = '0045b455-6537-4a6c-8264-6924308bbafb'

async function probe(id: string, label: string) {
  console.log(`\n━━━ ${label} (${id}) ━━━`)
  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const [
    { data: client, error: clientErr },
    { data: financialStatements },
    { data: profileFields },
    { data: personLinks },
    { data: pkdMain },
  ] = await Promise.all([
    sb.from('clients').select('*').eq('id', id).single(),
    sb
      .from('financial_statements')
      .select('okres_data_koniec, przychody_netto, zysk_netto, aktywa_razem, liczba_pracownikow')
      .eq('client_id', id)
      .order('okres_data_koniec', { ascending: false }),
    sb
      .from('company_profile_fields')
      .select('field_key, value_text, value_number, value_json, source')
      .eq('client_id', id)
      .is('superseded_at', null),
    sb
      .from('person_company_links')
      .select(
        'rola, jest_decyzyjny, persons:persons!inner(id, imie, nazwisko, source, rejestrio_person_id)',
      )
      .eq('client_id', id)
      .is('data_do', null),
    sb
      .from('company_profile_fields')
      .select('value_text, value_json')
      .eq('client_id', id)
      .eq('field_key', 'pkd_main')
      .is('superseded_at', null)
      .limit(1)
      .maybeSingle(),
  ])

  if (clientErr || !client) {
    console.error('client query error:', clientErr)
    return
  }

  const c = client as Record<string, unknown> & {
    pkd_codes: string[] | null
    business_profile: unknown
    vat_bank_accounts: string[] | null
    krs_legal_form: string | null
    city: string | null
    region: string | null
  }

  console.log('clients fields KEY-CHECK:')
  console.log('  status:', c.status, typeof c.status)
  console.log('  pkd_codes:', Array.isArray(c.pkd_codes) ? `[${c.pkd_codes.length}]` : c.pkd_codes)
  console.log('  vat_bank_accounts:', Array.isArray(c.vat_bank_accounts) ? `[${c.vat_bank_accounts.length}]` : c.vat_bank_accounts)
  console.log('  business_profile:', typeof c.business_profile, JSON.stringify(c.business_profile)?.slice(0, 80))
  console.log('  kapital_zakladowy:', c.kapital_zakladowy, typeof c.kapital_zakladowy)
  console.log('  founded_at:', c.founded_at)
  console.log('  city:', c.city, '/region:', c.region, '/legal_form:', c.krs_legal_form)

  const fs = (financialStatements ?? []) as Array<{
    okres_data_koniec: string
    przychody_netto: number | string | null
    zysk_netto: number | string | null
    aktywa_razem: number | string | null
    liczba_pracownikow: number | null
  }>

  // Mimic page transformations
  try {
    const profileMeta = `${c.krs_legal_form ?? '—'} · ${[c.city, c.region].filter(Boolean).join(', ') || '—'}`
    void profileMeta

    const fsMeta =
      fs.length > 0
        ? `${fs.length} lat KRS · ostatni rok ${fs[0]?.okres_data_koniec.slice(0, 4)}`
        : 'Brak danych'
    void fsMeta

    type PersonLinkRow = {
      rola: string
      jest_decyzyjny: boolean
      persons:
        | { id: string; imie: string; nazwisko: string; source: string | null; rejestrio_person_id: number | null }
        | { id: string; imie: string; nazwisko: string; source: string | null; rejestrio_person_id: number | null }[]
        | null
    }
    const allPersonLinks = ((personLinks ?? []) as unknown) as PersonLinkRow[]
    console.log('  personLinks count:', allPersonLinks.length)
    const personsForSection = allPersonLinks
      .map((l) => {
        const p = Array.isArray(l.persons) ? l.persons[0] : l.persons
        if (!p) return null
        return {
          imie: p.imie,
          nazwisko: p.nazwisko,
          rola: l.rola,
          jest_decyzyjny: l.jest_decyzyjny,
          source: p.source ?? 'unknown',
          rejestrio_person_id: p.rejestrio_person_id,
          network_count: 0,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    console.log('  personsForSection:', personsForSection.length)

    type CanonicalField = {
      field_key: string
      value_text: string | null
      value_number: number | null
      value_json: unknown
      source: string | null
    }
    const fieldsArr = ((profileFields ?? []) as CanonicalField[]).filter((f) => f.value_text)
    console.log('  canonical fields з value_text:', fieldsArr.length)

    const pkdMainRow = pkdMain as { value_text: string | null; value_json: unknown } | null
    console.log(
      '  pkdMain.value_json typeof:',
      typeof pkdMainRow?.value_json,
      JSON.stringify(pkdMainRow?.value_json)?.slice(0, 60),
    )
    const pkdMainName = (pkdMainRow?.value_json as { nazwa?: string } | null)?.nazwa ?? null
    console.log('  pkdMainName:', pkdMainName)

    console.log('✅ All page transformations completed without throw')
  } catch (err) {
    console.log(`💥 Throw at SSR transform: ${err instanceof Error ? err.message : String(err)}`)
    console.log(err instanceof Error ? err.stack : '')
  }
}

async function main() {
  await probe(KOZAK_ID, 'KOZAK')
  await probe(DEKOB_ID, 'DEKOB')
}

main().catch(console.error)
