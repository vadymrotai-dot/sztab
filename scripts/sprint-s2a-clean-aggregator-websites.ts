// scripts/sprint-s2a-clean-aggregator-websites.ts
// Sprint S2A Phase 2 — purge clients.website / company_profile_fields
// з aggregator domains (Sprint S2A blocklist).

import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'
import { AGGREGATOR_BLOCKLIST } from '@/lib/enrichment/web-search'

async function main() {
  // Build SQL fragment: website ILIKE '%domain%' for each blocklist entry
  const conditions = AGGREGATOR_BLOCKLIST.map((d) => `website ILIKE '%${d}%'`).join(' OR ')

  console.log('━━━ BEFORE ━━━')
  const before = await executeManagementSQL(
    `SELECT id, title, website FROM clients WHERE website IS NOT NULL AND (${conditions});`,
  )
  console.log(JSON.stringify(before.rows, null, 2))

  console.log('\n━━━ Clear clients.website (aggregator hits) ━━━')
  const upd = await executeManagementSQL(
    `UPDATE clients SET website = NULL WHERE website IS NOT NULL AND (${conditions}) RETURNING id;`,
  )
  console.log(`Cleared ${upd.rows?.length ?? 0} rows`)

  // Same для canonical company_profile_fields
  const canConditions = AGGREGATOR_BLOCKLIST.map((d) => `value_text ILIKE '%${d}%'`).join(' OR ')
  console.log('\n━━━ Mark canonical website fields як superseded ━━━')
  const upd2 = await executeManagementSQL(
    `UPDATE company_profile_fields SET superseded_at = now()
     WHERE field_key = 'website' AND superseded_at IS NULL AND (${canConditions})
     RETURNING id;`,
  )
  console.log(`Superseded ${upd2.rows?.length ?? 0} rows`)

  // KOZAK quick check
  const kozak = await executeManagementSQL(`
    SELECT website, website_krs FROM clients WHERE nip = '7561993172';
  `)
  console.log('\n━━━ KOZAK websites after cleanup ━━━')
  console.log(JSON.stringify(kozak.rows, null, 2))
}

main().catch(console.error)
