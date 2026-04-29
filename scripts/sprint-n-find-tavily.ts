import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const r = await executeManagementSQL(`SELECT * FROM params LIMIT 1;`)
  console.log('ok:', r.ok, 'error:', r.error)
  if (r.rows && r.rows[0]) {
    const row = r.rows[0] as Record<string, unknown>
    console.log('params keys:', Object.keys(row).sort())
    // Check for tavily-like
    const tavily = Object.keys(row).filter((k) => k.toLowerCase().includes('tavily'))
    console.log('tavily-matching keys:', tavily)
  }
}
main().catch(console.error)
