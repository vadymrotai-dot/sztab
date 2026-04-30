// scripts/sprint-s1-test-kozak.ts
// Sprint S1 Phase 5 — direct invocation of runRejestrioStep dla KOZAK OLEK
// + GUS branches step + DB verification report.
//
// We cannot easily HTTP-call /api/intelligence/lookup без auth cookies;
// instead we replicate runRejestrioStep + GUS branches inline using
// lib/rejestrio/* + lib/gus/branches modules (same code path).

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'
import { executeManagementSQL } from '@/lib/supabase/management'
import { gusLogin, enrichWithGUS } from '@/lib/enrichment/gus'
import { fetchBranches } from '@/lib/gus/branches'
import { fetchOrgBasic } from '@/lib/rejestrio/org-basic'
import { fetchRozdzialOgolny } from '@/lib/rejestrio/rozdzial-ogolny'
import { fetchRozdzialPrzeksztalcenia } from '@/lib/rejestrio/rozdzial-przeksztalcenia'
import { fetchRozdzialWzmianki } from '@/lib/rejestrio/rozdzial-wzmianki'
import { fetchRozdzialOddzialy } from '@/lib/rejestrio/rozdzial-oddzialy'
import { fetchAllFinancials } from '@/lib/rejestrio/sprawozdania'
import { fetchPersonNetwork } from '@/lib/rejestrio/person-network'
import { fetchCrbr } from '@/lib/rejestrio/crbr'

const KOZAK_NIP = '7561993172'
const KOZAK_KRS = '0000977768'

async function main() {
  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: paramsRow } = await supabase
    .from('params')
    .select('gus_api_key, krs_rejestr_api_token')
    .single()
  const p = paramsRow as { gus_api_key: string; krs_rejestr_api_token: string }
  const gusKey = p.gus_api_key
  const rejestrioKey = p.krs_rejestr_api_token

  const { data: clientRow } = await supabase
    .from('clients')
    .select('id')
    .eq('nip', KOZAK_NIP)
    .single()
  const clientId = (clientRow as { id: string }).id
  console.log(`KOZAK client_id: ${clientId}\n`)

  // ─── GUS branches ───
  console.log('━━━ GUS branches ━━━')
  const sid = await gusLogin(gusKey)
  const gus = await enrichWithGUS(sid, KOZAK_NIP)
  const silosId = (gus.raw as { search?: { SilosID?: string } })?.search?.SilosID
  const branches = await fetchBranches(sid, gus.regon!, silosId)
  console.log(`Branches: ${branches.length}`)
  for (const b of branches) {
    if (!b.regon_jednostki) continue
    await supabase.from('company_branches').upsert(
      {
        client_id: clientId,
        regon_jednostki: b.regon_jednostki,
        nazwa: b.nazwa,
        adres: b.adres,
        data_rozpoczecia: b.data_rozpoczecia,
        status: b.status,
        source: 'gus_bir',
      },
      { onConflict: 'client_id,regon_jednostki' },
    )
  }

  // ─── rejestr.io v2 modules ───
  console.log('\n━━━ rejestr.io v2 ━━━')

  const orgBasic = await fetchOrgBasic(rejestrioKey, KOZAK_KRS)
  if (orgBasic) {
    console.log(`org-basic: rejestrio_org_id=${orgBasic.rejestrio_org_id}, employees=${orgBasic.employees_count}`)
    await supabase
      .from('clients')
      .update({
        rejestrio_org_id: orgBasic.rejestrio_org_id,
        employees_count: orgBasic.employees_count,
      })
      .eq('id', clientId)
  }

  const ogolny = await fetchRozdzialOgolny(rejestrioKey, KOZAK_KRS)
  console.log(
    `ogolny: email=${ogolny.email_krs}, www=${ogolny.website_krs}, kapital=${ogolny.kapital_zakladowy}, opp=${ogolny.opp_status}, founded=${ogolny.founded_at}`,
  )
  console.log(
    `  zarzad=${ogolny.zarzad.length}, prokurenci=${ogolny.prokurenci.length}, wspolnicy=${ogolny.wspolnicy.length}`,
  )
  await supabase
    .from('clients')
    .update({
      email_krs: ogolny.email_krs,
      website_krs: ogolny.website_krs,
      kapital_zakladowy: ogolny.kapital_zakladowy,
      kapital_akcyjny: ogolny.kapital_akcyjny,
      opp_status: ogolny.opp_status,
      founded_at: ogolny.founded_at,
      suspended_at: ogolny.suspended_at,
    })
    .eq('id', clientId)

  // Upsert persons
  const allPersons = [...ogolny.zarzad, ...ogolny.prokurenci, ...ogolny.wspolnicy]
  for (const person of allPersons) {
    if (!person.rejestrio_person_id) continue
    const { data: pIns } = await supabase
      .from('persons')
      .upsert(
        {
          rejestrio_person_id: person.rejestrio_person_id,
          imie: person.imie,
          nazwisko: person.nazwisko ?? '?',
          zrodla_pol: { imie: 'rejestrio_v2', nazwisko: 'rejestrio_v2' },
          source: 'rejestrio_v2',
        },
        { onConflict: 'rejestrio_person_id' },
      )
      .select('id')
      .single()
    if (pIns) {
      const { data: existing } = await supabase
        .from('person_company_links')
        .select('id')
        .eq('client_id', clientId)
        .eq('person_id', (pIns as { id: string }).id)
        .maybeSingle()
      if (!existing) {
        await supabase.from('person_company_links').insert({
          person_id: (pIns as { id: string }).id,
          client_id: clientId,
          rola: person.funkcja ?? 'Członek',
          jest_decyzyjny:
            (person.funkcja ?? '').toLowerCase().includes('prezes') ||
            (person.funkcja ?? '').toLowerCase().includes('zarząd'),
          zrodlo: 'rejestrio_v2',
        })
      }
    }
  }

  const flags = await fetchRozdzialPrzeksztalcenia(rejestrioKey, KOZAK_KRS)
  console.log(
    `przeksztalcenia: bankruptcy=${flags.bankruptcy_flag}, liquidation=${flags.liquidation_flag}, restructuring=${flags.restructuring_flag}`,
  )
  await supabase
    .from('clients')
    .update({
      bankruptcy_flag: flags.bankruptcy_flag,
      liquidation_flag: flags.liquidation_flag,
      restructuring_flag: flags.restructuring_flag,
    })
    .eq('id', clientId)

  const wzm = await fetchRozdzialWzmianki(rejestrioKey, KOZAK_KRS)
  console.log(`wzmianki: last_filing_date=${wzm.last_filing_date}`)
  if (wzm.last_filing_date) {
    await supabase.from('clients').update({ last_filing_date: wzm.last_filing_date }).eq('id', clientId)
  }

  const odd = await fetchRozdzialOddzialy(rejestrioKey, KOZAK_KRS)
  console.log(`oddzialy: ${odd.branch_offices_count}`)
  await supabase
    .from('clients')
    .update({ branch_offices_count: Math.max(odd.branch_offices_count, branches.length) })
    .eq('id', clientId)

  const fins = await fetchAllFinancials(rejestrioKey, KOZAK_KRS)
  console.log(`sprawozdania: ${fins.length} years`)
  for (const f of fins) {
    await supabase.from('financial_statements').upsert(
      {
        client_id: clientId,
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
    console.log(
      `  ${f.okres_data_koniec}: przychody=${f.fields.przychody_netto}, zysk=${f.fields.zysk_netto}, aktywa=${f.fields.aktywa_razem}`,
    )
  }

  // Person network for zarzad
  let networkLinks = 0
  for (const p of ogolny.zarzad) {
    if (!p.rejestrio_person_id) continue
    const network = await fetchPersonNetwork(rejestrioKey, p.rejestrio_person_id)
    const { data: pRow } = await supabase
      .from('persons')
      .select('id')
      .eq('rejestrio_person_id', p.rejestrio_person_id)
      .maybeSingle()
    const sourcePersonId = (pRow as { id: string } | null)?.id
    if (!sourcePersonId) continue
    for (const link of network) {
      const { error } = await supabase.from('person_network_links').insert({
        source_person_id: sourcePersonId,
        linked_krs: link.linked_krs,
        linked_company_name: link.linked_company_name,
        relation_type: link.relation_type,
        relation_kierunek: link.relation_kierunek,
        data_start: link.data_start,
        data_koniec: link.data_koniec,
      })
      if (!error) networkLinks++
    }
  }
  console.log(`person network links: ${networkLinks}`)

  const beneficiaries = await fetchCrbr(rejestrioKey, KOZAK_KRS)
  console.log(`crbr: ${beneficiaries.length}`)
  for (const b of beneficiaries) {
    await supabase.from('crbr_beneficiaries').upsert(
      {
        client_id: clientId,
        rejestrio_person_id: b.rejestrio_person_id,
        imie: b.imie,
        nazwisko: b.nazwisko,
        kraj_rezydencji: b.kraj_rezydencji,
        obywatelstwa: b.obywatelstwa,
        rola: b.rola,
      },
      { onConflict: 'client_id,rejestrio_person_id' },
    )
  }

  // ─── Verify ───
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('KOZAK OLEK enrichment results (DB):')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const v = await executeManagementSQL(`
    SELECT
      email_krs, website_krs, kapital_zakladowy, kapital_akcyjny,
      opp_status, founded_at,
      bankruptcy_flag, liquidation_flag, restructuring_flag,
      suspended_at, branch_offices_count, last_filing_date,
      rejestrio_org_id, employees_count
    FROM clients WHERE nip = '${KOZAK_NIP}';
  `)
  console.log(JSON.stringify(v.rows, null, 2))

  const counts = await executeManagementSQL(`
    SELECT
      (SELECT COUNT(*) FROM financial_statements WHERE client_id = '${clientId}') AS financial_years,
      (SELECT COUNT(*) FROM persons p JOIN person_company_links l ON l.person_id = p.id WHERE l.client_id = '${clientId}' AND p.imie IS NOT NULL AND p.imie NOT ILIKE '(KRS%') AS persons_real_names,
      (SELECT COUNT(*) FROM persons p JOIN person_company_links l ON l.person_id = p.id WHERE l.client_id = '${clientId}') AS persons_total,
      (SELECT COUNT(*) FROM crbr_beneficiaries WHERE client_id = '${clientId}') AS crbr_count,
      (SELECT COUNT(*) FROM person_network_links pnl JOIN person_company_links l ON l.person_id = pnl.source_person_id WHERE l.client_id = '${clientId}') AS network_links,
      (SELECT COUNT(*) FROM company_branches WHERE client_id = '${clientId}') AS branches;
  `)
  console.log('\nCounts:')
  console.log(JSON.stringify(counts.rows, null, 2))

  const finsRow = await executeManagementSQL(`
    SELECT okres_data_koniec, przychody_netto, zysk_netto, aktywa_razem
    FROM financial_statements WHERE client_id = '${clientId}'
    ORDER BY okres_data_koniec DESC LIMIT 5;
  `)
  console.log('\nFinancial years (top 5):')
  console.log(JSON.stringify(finsRow.rows, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
