// scripts/run-ai-rescore-bulk.ts
// One-shot bulk AI re-score wrapper. Calls rescoreAllProducts() з service-role.
//
// Run:
//   pnpm exec tsx scripts/run-ai-rescore-bulk.ts

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'
import { rescoreAllProducts } from '@/lib/matching/ai-rescore'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

async function main() {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!svcKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing')
    process.exit(1)
  }
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY missing')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('\n══════ AI Re-Score Bulk ══════\n')
  const result = await rescoreAllProducts(supabase, apiKey)

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('BULK AI RE-SCORE SUMMARY')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Products processed:    ${result.summaries.length}`)
  console.log(`Successful:            ${result.summaries.filter((s) => !s.error).length}`)
  console.log(`Errors:                ${result.summaries.filter((s) => s.error).length}`)
  console.log(`Total cost:            $${result.total_cost_usd.toFixed(4)}`)
  console.log(`Total duration:        ${(result.total_duration_ms / 1000).toFixed(1)}s`)
  console.log(`Aborted (cost guard):  ${result.aborted ? 'YES' : 'no'}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (result.summaries.some((s) => s.error)) {
    console.log('\nErrors:')
    for (const s of result.summaries) {
      if (s.error) console.log(`  ${s.product_name}: ${s.error}`)
    }
  }

  // DB verify
  const { count: aiCount } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .not('ai_score', 'is', null)
  const { data: rangeData } = await supabase
    .from('matches')
    .select('ai_score')
    .not('ai_score', 'is', null)
  const scores = ((rangeData ?? []) as Array<{ ai_score: number }>).map((r) => r.ai_score)
  const min = scores.length > 0 ? Math.min(...scores) : 0
  const max = scores.length > 0 ? Math.max(...scores) : 0

  console.log(`\nDB verify:`)
  console.log(`  total з ai_score:    ${aiCount ?? '?'}`)
  console.log(`  ai_score range:      ${min} - ${max}`)
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
