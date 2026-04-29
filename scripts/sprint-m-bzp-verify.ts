import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const r = await executeManagementSQL(`
    SELECT bzp_notice_id, winner_nip, winner_name, ordering_party, c.nip AS client_nip, c.title
    FROM bzp_tenders bt
    LEFT JOIN clients c ON c.id = bt.client_id
    WHERE bt.client_id IS NOT NULL
    LIMIT 30;
  `)
  console.log(JSON.stringify(r.rows, null, 2))
}

main()
