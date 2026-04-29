// scripts/sprint-m-diagnostic.ts
// Sprint M evidence gathering за KOZAK OLEK.

import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

const KOZAK_ID = 'ed4e12e5-e432-48f2-ba74-af930171a884'

async function q(label: string, sql: string) {
  console.log(`\n━━━ ${label} ━━━`)
  const r = await executeManagementSQL(sql)
  if (!r.ok) {
    console.error('FAIL:', r.error)
    return
  }
  const rows = r.rows ?? []
  if (rows.length === 0) {
    console.log('(no rows)')
  } else {
    console.log(JSON.stringify(rows, null, 2).slice(0, 4000))
  }
}

async function main() {
  await q(
    'company_profile_fields для KOZAK OLEK',
    `SELECT field_key, source, source_priority,
      LEFT(COALESCE(value_text, value_json::text), 100) AS preview
    FROM company_profile_fields
    WHERE client_id = '${KOZAK_ID}'
    ORDER BY source_priority DESC
    LIMIT 60;`,
  )

  await q(
    'enrichment_log останні 30',
    `SELECT source, status, run_completed_at, LEFT(COALESCE(error_message,''), 100) AS error
    FROM enrichment_log
    WHERE target_id = '${KOZAK_ID}'
    ORDER BY run_started_at DESC
    LIMIT 30;`,
  )

  await q(
    'bzp_tenders для KOZAK OLEK',
    `SELECT bzp_notice_id, winner_nip, winner_name, ordering_party, award_date, cpv_codes
    FROM bzp_tenders
    WHERE client_id = '${KOZAK_ID}'
    LIMIT 20;`,
  )

  await q(
    'clients legacy PKD arrays',
    `SELECT pkd_2007_codes, pkd_2025_codes,
      array_length(pkd_2007_codes, 1) AS len_2007,
      array_length(pkd_2025_codes, 1) AS len_2025,
      forma_prawna, business_profile IS NOT NULL AS has_profile
    FROM clients
    WHERE id = '${KOZAK_ID}';`,
  )

  await q(
    'persons via person_company_links',
    `SELECT pcl.role_label, p.imie, p.nazwisko
    FROM person_company_links pcl
    JOIN persons p ON p.id = pcl.person_id
    WHERE pcl.client_id = '${KOZAK_ID}'
    LIMIT 10;`,
  )

  await q(
    'company_financials',
    `SELECT rok, przychody_pln, zysk_netto_pln
    FROM company_financials
    WHERE client_id = '${KOZAK_ID}'
    ORDER BY rok DESC
    LIMIT 5;`,
  )
}

main().catch((err) => {
  console.error('Crashed:', err)
  process.exit(1)
})
