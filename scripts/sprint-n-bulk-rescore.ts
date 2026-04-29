// scripts/sprint-n-bulk-rescore.ts
// Sprint N Phase A1 — bulk re-score all clients + all 275 CEIDG prospects.
// Re-uses Sprint M FIX 2 PKD canonical sync (pkd_2007_codes mirrored).

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'
import { bulkRecomputeAll } from '@/lib/matching/engine'

async function main() {
  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('Starting bulk re-score (clients + prospects)...')
  const startedAt = Date.now()
  const summary = await bulkRecomputeAll(supabase, {})
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)

  console.log(`\n━━━ Bulk re-score summary (${seconds}s) ━━━`)
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
