// scripts/diag-apify-token-check.ts
// READ-ONLY — verify apify_api_token presence in params (length only,
// never log the value).
import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const r = await executeManagementSQL(
    `SELECT
       owner_id IS NOT NULL AS has_owner,
       apify_api_token IS NOT NULL AS has_token,
       COALESCE(LENGTH(apify_api_token), 0) AS token_len
     FROM params LIMIT 1;`,
  )
  console.log('apify token check:', JSON.stringify(r.rows))
  console.log('ok=', r.ok, 'error=', r.error)
}
main().catch(console.error)
