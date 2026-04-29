import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  // Check if last_disqualified_at column exists on clients
  const cols = await executeManagementSQL(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name LIKE '%disqual%';
  `)
  console.log('clients disqualify cols:', JSON.stringify(cols.rows, null, 2))

  // Status values
  const statuses = await executeManagementSQL(`
    SELECT status, COUNT(*) FROM clients GROUP BY status;
  `)
  console.log('client statuses:', JSON.stringify(statuses.rows, null, 2))

  const pStatuses = await executeManagementSQL(`
    SELECT status, COUNT(*) FROM ceidg_prospects GROUP BY status;
  `)
  console.log('prospect statuses:', JSON.stringify(pStatuses.rows, null, 2))
}

main().catch(console.error)
