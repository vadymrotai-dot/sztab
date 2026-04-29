// scripts/sprint-m-bzp-cleanup.ts
// Sprint M FIX 1 — purge bzp_tenders rows polluted by `?? nip` fallback bug.
// All client-linked rows are suspect because the legacy orchestrator stamped
// client.nip onto winner_nip whenever htmlBody parser failed (which was
// always — the parser was naive). Re-run /api/intelligence/lookup після fix
// to repopulate з strict winner.nip == client.nip filtering.

import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  console.log('━━━ BEFORE ━━━')
  const before = await executeManagementSQL(
    `SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE client_id IS NOT NULL) AS with_client,
      COUNT(*) FILTER (WHERE prospect_id IS NOT NULL) AS with_prospect
    FROM bzp_tenders;`,
  )
  console.log(JSON.stringify(before.rows, null, 2))

  console.log('\n━━━ DELETE all client-linked rows (orchestrator pollution) ━━━')
  const del = await executeManagementSQL(
    `DELETE FROM bzp_tenders
     WHERE client_id IS NOT NULL
     RETURNING bzp_notice_id;`,
  )
  console.log(`Deleted ${del.rows?.length ?? 0} rows`, del.ok ? '' : del.error)

  console.log('\n━━━ AFTER ━━━')
  const after = await executeManagementSQL(
    `SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE client_id IS NOT NULL) AS with_client
     FROM bzp_tenders;`,
  )
  console.log(JSON.stringify(after.rows, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
