// scripts/sprint-s2a-verify-kozak.ts
// Sprint S2A Phase 5 — final DB verification dla KOZAK OLEK.

import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function q(label: string, sql: string) {
  console.log(`\n━━━ ${label} ━━━`)
  const r = await executeManagementSQL(sql)
  if (!r.ok) {
    console.error('FAIL:', r.error)
    return
  }
  console.log(JSON.stringify(r.rows, null, 2))
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('SPRINT S2A — KOZAK OLEK FINAL VERIFICATION')
  console.log('═══════════════════════════════════════════════════════════════')

  await q(
    'clients (S1 + S2A fields)',
    `SELECT nip, title,
      kapital_zakladowy, founded_at,
      bankruptcy_flag, liquidation_flag, restructuring_flag,
      branch_offices_count, last_filing_date,
      website, website_krs
    FROM clients WHERE nip = '7561993172';`,
  )

  await q(
    'persons by source',
    `SELECT p.imie, p.nazwisko, p.source, p.rejestrio_person_id, pcl.rola
    FROM persons p
    JOIN person_company_links pcl ON pcl.person_id = p.id
    JOIN clients c ON c.id = pcl.client_id
    WHERE c.nip = '7561993172';`,
  )

  await q(
    'matches top 5 (algo_score)',
    `SELECT m.algo_score, p.name AS product, m.score_breakdown
    FROM matches m
    JOIN products p ON p.id = m.product_id
    JOIN clients c ON c.id = m.client_id
    WHERE c.nip = '7561993172'
    ORDER BY m.algo_score DESC LIMIT 5;`,
  )

  await q(
    'financial_statements',
    `SELECT okres_data_koniec, przychody_netto, zysk_netto, aktywa_razem
    FROM financial_statements
    WHERE client_id = (SELECT id FROM clients WHERE nip='7561993172')
    ORDER BY okres_data_koniec DESC;`,
  )

  await q(
    'crbr_beneficiaries',
    `SELECT imie, nazwisko, kraj_rezydencji, obywatelstwa
    FROM crbr_beneficiaries
    WHERE client_id = (SELECT id FROM clients WHERE nip='7561993172');`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
