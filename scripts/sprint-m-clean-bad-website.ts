// scripts/sprint-m-clean-bad-website.ts
// Sprint M FIX 6 — purge canonical company_profile_fields rows where
// website_url є aggregator (krs-pobierz.pl etc).

import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

const BLOCKLIST = [
  'krs-pobierz.pl',
  'panoramafirm.pl',
  'aleo.com',
  'biznesfinder.pl',
  'mojepanstwo.pl',
  'bisnode.pl',
  'rzetelnafirma.pl',
  'msig.pl',
  'imsig.pl',
  'rejestrio.pl',
  'rejestr.io',
  'krs.pl',
  'bzp.uzp.gov.pl',
  'ezamowienia.gov.pl',
]

async function main() {
  // Build OR clause
  const conditions = BLOCKLIST.map((b) => `value_text LIKE '%${b}%'`).join(' OR ')

  console.log('━━━ BEFORE ━━━')
  const before = await executeManagementSQL(
    `SELECT client_id, value_text, source FROM company_profile_fields
     WHERE field_key = 'website' AND superseded_at IS NULL AND (${conditions})
     LIMIT 50;`,
  )
  console.log(JSON.stringify(before.rows, null, 2))

  console.log('\n━━━ Mark як superseded ━━━')
  const upd = await executeManagementSQL(
    `UPDATE company_profile_fields
     SET superseded_at = now()
     WHERE field_key = 'website' AND superseded_at IS NULL AND (${conditions})
     RETURNING id;`,
  )
  console.log(`Superseded ${upd.rows?.length ?? 0} rows`)

  console.log('\n━━━ Also clear clients.website if matching ━━━')
  const clientUpd = await executeManagementSQL(
    `UPDATE clients SET website = NULL
     WHERE website IS NOT NULL AND (${conditions.replace(/value_text/g, 'website')})
     RETURNING id, title;`,
  )
  console.log(`Cleared ${clientUpd.rows?.length ?? 0} clients.website fields`)
  console.log(JSON.stringify(clientUpd.rows, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
