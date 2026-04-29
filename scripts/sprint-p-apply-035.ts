import '@/lib/env'
import * as fs from 'node:fs/promises'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const sql = await fs.readFile('scripts/035_unify_entity_type.sql', 'utf-8')
  console.log('Applying 035_unify_entity_type.sql...')
  const r = await executeManagementSQL(sql)
  if (!r.ok) {
    console.error('FAIL:', r.error)
    process.exit(1)
  }
  const v = await executeManagementSQL(`
    SELECT
      (SELECT COUNT(*) FROM information_schema.columns
       WHERE table_name = 'clients' AND column_name = 'entity_type') AS col_exists,
      (SELECT COUNT(*) FROM clients WHERE entity_type = 'client') AS clients_count,
      (SELECT COUNT(*) FROM clients WHERE entity_type = 'prospect') AS prospects_count;
  `)
  console.log('✅ Applied. Verification:')
  console.log(JSON.stringify(v.rows, null, 2))
}

main().catch(console.error)
