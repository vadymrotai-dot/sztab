import '@/lib/env'
import * as fs from 'node:fs/promises'
import { executeManagementSQL } from '@/lib/supabase/management'

const MIGRATIONS = [
  '036_clients_rejestrio_fields.sql',
  '037_financial_statements.sql',
  '038_crbr_beneficiaries.sql',
  '039_persons_rejestrio_id.sql',
  '040_person_network_links.sql',
  '041_company_branches.sql',
]

async function main() {
  for (const m of MIGRATIONS) {
    const sql = await fs.readFile(`scripts/${m}`, 'utf-8')
    console.log(`Applying ${m}...`)
    const r = await executeManagementSQL(sql)
    if (!r.ok) {
      console.error(`FAIL ${m}: ${r.error}`)
      process.exit(1)
    }
    console.log(`  ✅ ${m}`)
  }

  console.log('\n━━━ Verification ━━━')
  const v = await executeManagementSQL(`
    SELECT
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='clients' AND column_name='rejestrio_org_id') AS clients_rejestrio_id,
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='financial_statements') AS fs_table,
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='crbr_beneficiaries') AS crbr_table,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='persons' AND column_name='rejestrio_person_id') AS persons_rejestrio_id,
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='person_network_links') AS pnl_table,
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='company_branches') AS branches_table;
  `)
  console.log(JSON.stringify(v.rows, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
