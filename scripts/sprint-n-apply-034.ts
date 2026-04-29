import '@/lib/env'
import * as fs from 'node:fs/promises'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const sql = await fs.readFile('scripts/034_cohort_handoff.sql', 'utf-8')
  console.log('Applying 034_cohort_handoff.sql...')
  const r = await executeManagementSQL(sql)
  if (!r.ok) {
    console.error('FAIL:', r.error)
    process.exit(1)
  }
  console.log('✅ Applied. Verifying...')
  const v = await executeManagementSQL(`
    SELECT
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'cohort_cold_openers') AS cold_openers_table,
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'pikniko_handoff_cohorts') AS pikniko_cohorts_table;
  `)
  console.log(JSON.stringify(v.rows, null, 2))
}

main().catch(console.error)
