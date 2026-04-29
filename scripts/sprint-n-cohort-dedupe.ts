// scripts/sprint-n-cohort-dedupe.ts
// Sprint N: dedupe cohort by NIP — when both client + prospect exist,
// keep client (higher source priority, already у customer pipeline).

import '@/lib/env'
import * as fs from 'node:fs/promises'

interface CohortEntry {
  id: string | null
  type: 'client' | 'prospect'
  name: string
  nip: string
  score: number
  region: string | null
  legal_form: string | null
}

async function main() {
  const raw = await fs.readFile('/tmp/sprint-n-cohort.json', 'utf-8')
  const before = JSON.parse(raw) as CohortEntry[]

  // Group by NIP, keep client preference
  const byNip = new Map<string, CohortEntry[]>()
  for (const e of before) {
    if (!e.nip) continue
    const arr = byNip.get(e.nip) ?? []
    arr.push(e)
    byNip.set(e.nip, arr)
  }

  const after: CohortEntry[] = []
  const removed: string[] = []
  for (const [nip, arr] of byNip) {
    if (arr.length === 1) {
      after.push(arr[0]!)
      continue
    }
    const client = arr.find((e) => e.type === 'client')
    const prospect = arr.find((e) => e.type === 'prospect')
    if (client) {
      after.push(client)
      if (prospect) removed.push(`prospect ${prospect.name} (${nip}) — client wins`)
    } else {
      // No client; just keep first prospect (highest-score by virtue of order)
      after.push(arr[0]!)
    }
  }

  // Preserve original score ordering
  after.sort((a, b) => b.score - a.score)

  console.log(`━━━ Dedup ━━━`)
  console.log(`Before: ${before.length}`)
  console.log(`After:  ${after.length}`)
  console.log(`Removed: ${removed.length}`)
  for (const r of removed) console.log(`  - ${r}`)

  await fs.writeFile('/tmp/sprint-n-cohort.json', JSON.stringify(after, null, 2))

  console.log(`\n━━━ TOP 10 cohort (post-dedup) ━━━\n`)
  for (let i = 0; i < Math.min(10, after.length); i++) {
    const e = after[i]!
    console.log(
      `#${String(i + 1).padStart(2, ' ')} ${e.name} (${e.nip}) | type=${e.type} | score=${e.score} | region=${e.region ?? '?'} | forma=${e.legal_form ?? '?'}`,
    )
  }

  // Need to also pull match details (product + family) — not stored у cohort json
  // Let me re-query DB:
  const { executeManagementSQL } = await import('@/lib/supabase/management')
  const ids = after.slice(0, 10).map((e) => `'${e.id}'`).join(',')
  const matches = await executeManagementSQL(`
    SELECT
      COALESCE(m.client_id::text, m.prospect_id::text) AS entity_id,
      m.combined_score,
      p.name AS product_name,
      tf.name_pl AS family_name
    FROM (
      SELECT DISTINCT ON (COALESCE(client_id, prospect_id))
        client_id, prospect_id, product_id, combined_score
      FROM matches
      WHERE COALESCE(client_id::text, prospect_id::text) IN (${ids})
      ORDER BY COALESCE(client_id, prospect_id), combined_score DESC
    ) m
    JOIN products p ON p.id = m.product_id
    JOIN taxonomy_families tf ON tf.id = p.family_id;
  `)
  const matchMap = new Map<string, { product: string; family: string; score: number }>()
  for (const r of (matches.rows ?? []) as Array<{
    entity_id: string
    combined_score: number
    product_name: string
    family_name: string
  }>) {
    matchMap.set(r.entity_id, {
      product: r.product_name,
      family: r.family_name,
      score: r.combined_score,
    })
  }

  console.log(`\n━━━ TOP 10 з match details ━━━\n`)
  for (let i = 0; i < Math.min(10, after.length); i++) {
    const e = after[i]!
    const m = matchMap.get(e.id ?? '')
    console.log(
      `#${String(i + 1).padStart(2, ' ')} ${e.name} (${e.nip}) | type=${e.type} | top match: ${m?.product ?? '?'} score ${m?.score ?? '?'} | family=${m?.family ?? '?'}`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
