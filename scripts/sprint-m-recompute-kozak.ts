// scripts/sprint-m-recompute-kozak.ts
// Sprint M FIX 2 — recompute matches для KOZAK OLEK after PKD backfill.

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'
import { computeMatchesForClient } from '@/lib/matching/engine'

const KOZAK_ID = 'ed4e12e5-e432-48f2-ba74-af930171a884'

async function main() {
  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('Recomputing matches для KOZAK OLEK...')
  const r = await computeMatchesForClient(supabase, KOZAK_ID)
  if (!r.ok) {
    console.error('FAIL:', r.error)
    process.exit(1)
  }
  console.log(`✅ Computed ${r.count} matches`)

  // Verify top-3
  const { data: top3 } = await supabase
    .from('matches')
    .select('algo_score, reason_codes, product_id, products(name)')
    .eq('client_id', KOZAK_ID)
    .order('algo_score', { ascending: false })
    .limit(5)
  console.log('\nTop 5 matches:')
  console.log(JSON.stringify(top3, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
