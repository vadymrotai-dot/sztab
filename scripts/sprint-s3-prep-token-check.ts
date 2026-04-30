import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const r = await executeManagementSQL(
    `SELECT supabase_access_token IS NOT NULL AS has_token, owner_id IS NOT NULL AS has_owner FROM params LIMIT 1;`,
  )
  console.log('management token check:', JSON.stringify(r.rows))
  console.log('ok=', r.ok, 'error=', r.error)
}
main().catch(console.error)
