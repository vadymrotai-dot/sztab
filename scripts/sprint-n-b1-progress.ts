import '@/lib/env'
import * as fs from 'node:fs/promises'
import { executeManagementSQL } from '@/lib/supabase/management'

interface CohortEntry {
  id: string
  type: 'client' | 'prospect'
  name: string
  nip: string
}

async function main() {
  const cohort = JSON.parse(
    await fs.readFile('/tmp/sprint-n-cohort.json', 'utf-8'),
  ) as CohortEntry[]
  const ids = cohort.map((e) => `'${e.id}'`).join(',')

  const r = await executeManagementSQL(`
    SELECT
      target_type,
      status,
      COUNT(*) AS n,
      SUM(cost_usd) AS total_cost
    FROM contact_enrichment
    WHERE target_id IN (${ids})
      AND source = 'apify_gmaps'
      AND enriched_at > now() - INTERVAL '2 hours'
    GROUP BY target_type, status
    ORDER BY target_type, status;
  `)
  console.log('contact_enrichment activity (last 2h):')
  console.log(JSON.stringify(r.rows, null, 2))

  const totals = await executeManagementSQL(`
    SELECT
      COUNT(DISTINCT target_id) AS unique_entities_processed,
      SUM(cost_usd) AS total_cost
    FROM contact_enrichment
    WHERE target_id IN (${ids})
      AND source = 'apify_gmaps'
      AND enriched_at > now() - INTERVAL '2 hours';
  `)
  console.log('\nTotals:')
  console.log(JSON.stringify(totals.rows, null, 2))
}

main().catch(console.error)
