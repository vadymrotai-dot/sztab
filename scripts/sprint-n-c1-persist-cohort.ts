// scripts/sprint-n-c1-persist-cohort.ts
// Sprint N Phase C1 — persist cohort row до pikniko_handoff_cohorts.

import '@/lib/env'
import * as fs from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

interface CohortEntry {
  id: string
  type: 'client' | 'prospect'
  name: string
  nip: string
  score: number
  region: string | null
  legal_form: string | null
}

const COHORT_NAME = 'Pierwsza partia HoReCa kiszonki/buraki'

async function main() {
  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cohort = JSON.parse(
    await fs.readFile('/tmp/sprint-n-cohort.json', 'utf-8'),
  ) as CohortEntry[]

  const entity_ids = cohort.map((e) => ({
    id: e.id,
    type: e.type,
    rank: cohort.indexOf(e) + 1,
  }))

  const metadata = {
    filter_criteria: {
      min_combined_score: 60,
      families: [
        'Kiszonki',
        'Sałatki gotowe',
        'Marynaty',
        'Buraki / Warzywa konserwowane',
        'Warzywa konserwowane',
        'Sałatki',
      ],
      excluded_statuses: ['lost', 'odrzucony'],
      cap: 30,
      dedupe: 'by NIP, prefer client',
    },
    bulk_rescore_version: 'sprint-n-2026-04-29',
    enrichment_summary: {
      apify_success: 4,
      apify_no_match: 13,
      apify_skipped_preflight: 10,
      apify_error: 2,
      ceidg_owners_created: 18,
      cold_openers_generated: 29,
      total_cost_usd: 1.39,
    },
    distribution: {
      clients: cohort.filter((e) => e.type === 'client').length,
      prospects: cohort.filter((e) => e.type === 'prospect').length,
    },
  }

  // Upsert by cohort_name (UNIQUE)
  const { data, error } = await supabase
    .from('pikniko_handoff_cohorts')
    .upsert({ cohort_name: COHORT_NAME, entity_ids, metadata }, { onConflict: 'cohort_name' })
    .select('id, total_entities, created_at')
    .single()

  if (error) {
    console.error('FAIL:', error.message)
    process.exit(1)
  }

  console.log('✅ Cohort persisted:')
  console.log(JSON.stringify(data, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
