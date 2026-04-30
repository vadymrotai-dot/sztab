import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const r = await executeManagementSQL(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'matches'
    ORDER BY column_name;
  `)
  console.log(JSON.stringify(r.rows, null, 2))
}
main().catch(console.error)
