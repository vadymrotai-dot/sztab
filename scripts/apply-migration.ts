// scripts/apply-migration.ts
// Apply SQL file via Supabase Management API. Token loaded from
// .env.local automatically (dotenv/config). NEVER passed via command
// arg or inline shell var — see feedback_secrets_handling.md.
//
// Prereq: .env.local exists з SUPABASE_ACCESS_TOKEN (run setup-env.ts first).
//
// Run:
//   pnpm dlx tsx scripts/apply-migration.ts scripts/017_vat_enrichment.sql

import '@/lib/env'

import fs from 'node:fs/promises'
import path from 'node:path'

import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const sqlPath = process.argv[2]
  if (!sqlPath) {
    console.error('Usage: pnpm dlx tsx scripts/apply-migration.ts <path-to-sql-file>')
    process.exit(1)
  }

  const absPath = path.resolve(sqlPath)
  let sql: string
  try {
    sql = await fs.readFile(absPath, 'utf-8')
  } catch (err) {
    console.error(`❌ Cannot read ${absPath}:`, err instanceof Error ? err.message : err)
    process.exit(1)
  }

  console.log(`[MIGRATION] Applying ${sqlPath}`)
  console.log(`            (${sql.length} bytes, ${sql.split('\n').length} lines)`)

  const result = await executeManagementSQL(sql)

  if (!result.ok) {
    console.error(`❌ Migration failed (HTTP ${result.status ?? 'n/a'}):`)
    console.error(`   ${result.error}`)
    process.exit(1)
  }

  console.log(`✅ Migration applied successfully (HTTP ${result.status})`)
  if (result.rows && result.rows.length > 0) {
    const preview = JSON.stringify(result.rows, null, 2).slice(0, 1500)
    console.log(`Response preview:\n${preview}`)
  }
}

main().catch((err) => {
  console.error('Crashed:', err)
  process.exit(1)
})
