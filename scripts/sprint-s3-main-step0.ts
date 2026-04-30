// Sprint S3 main STEP 0 — sanity check. Reads ONLY lengths/booleans;
// никогда echoes actual secret values до stdout.

import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  console.log('━━━ Migration 044 columns ━━━')
  const cols = await executeManagementSQL(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name='params' AND column_name LIKE 'allegro_%'
    ORDER BY column_name;
  `)
  console.log(JSON.stringify(cols.rows, null, 2))
  console.log(`Columns count: ${cols.rows?.length ?? 0}/4`)

  console.log('\n━━━ Credentials length sanity (NEVER echoes values) ━━━')
  const creds = await executeManagementSQL(`
    SELECT
      length(allegro_client_id) AS id_len,
      length(allegro_client_secret) AS secret_len,
      allegro_access_token IS NOT NULL AS has_cached_token,
      allegro_token_expires_at AS token_expires_at,
      owner_id IS NOT NULL AS has_owner
    FROM params LIMIT 1;
  `)
  console.log(JSON.stringify(creds.rows, null, 2))
}

main().catch(console.error)
