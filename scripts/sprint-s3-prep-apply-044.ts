import '@/lib/env'
import * as fs from 'node:fs/promises'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const sql = await fs.readFile('scripts/044_allegro_params.sql', 'utf-8')
  console.log('Applying 044_allegro_params.sql...')
  const r = await executeManagementSQL(sql)
  if (!r.ok) {
    console.error('FAIL:', r.error)
    process.exit(1)
  }
  console.log('✅ Applied. Verifying...')

  const v = await executeManagementSQL(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name='params' AND column_name LIKE 'allegro_%'
    ORDER BY column_name;
  `)
  console.log(JSON.stringify(v.rows, null, 2))
  const count = v.rows?.length ?? 0
  console.log(`Columns added: ${count}/4`)
  if (count !== 4) {
    console.error('Expected 4 columns')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
