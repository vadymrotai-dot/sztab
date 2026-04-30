import '@/lib/env'
import * as fs from 'node:fs/promises'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const sql = await fs.readFile('scripts/043_matches_score_breakdown.sql', 'utf-8')
  const r = await executeManagementSQL(sql)
  if (!r.ok) {
    console.error('FAIL:', r.error)
    process.exit(1)
  }
  console.log('✅ Applied 043_matches_score_breakdown.sql')
}

main().catch(console.error)
