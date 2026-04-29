// scripts/sprint-n-cohort.ts
// Sprint N Phase A2/A3 — identify top-30 cohort + report.

import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

const FAM_PREDICATE = `(tf.name_pl IN ('Kiszonki', 'Sałatki gotowe', 'Marynaty', 'Buraki / Warzywa konserwowane', 'Warzywa konserwowane', 'Sałatki'))`

async function main() {
  // 1. Score distribution
  console.log('━━━ Score distribution (top match per entity) ━━━')
  const dist = await executeManagementSQL(`
    SELECT
      entity_type,
      COUNT(*) FILTER (WHERE top_score >= 80) AS s80_plus,
      COUNT(*) FILTER (WHERE top_score >= 70 AND top_score < 80) AS s70_80,
      COUNT(*) FILTER (WHERE top_score >= 60 AND top_score < 70) AS s60_70,
      COUNT(*) FILTER (WHERE top_score < 60) AS sub60,
      COUNT(*) AS total
    FROM (
      SELECT
        COALESCE(client_id::text, prospect_id::text) AS entity_id,
        CASE WHEN client_id IS NOT NULL THEN 'client' ELSE 'prospect' END AS entity_type,
        MAX(combined_score) AS top_score
      FROM matches
      GROUP BY entity_id, entity_type
    ) t
    GROUP BY entity_type;
  `)
  console.log(JSON.stringify(dist.rows, null, 2))

  // 2. Top-30 cohort: DISTINCT ON entity, ChM-relevant family, score >= 60
  const cohort = await executeManagementSQL(`
    SELECT
      m.combined_score,
      m.algo_score,
      m.client_id,
      m.prospect_id,
      m.reason_codes,
      m.product_id,
      p.name AS product_name,
      tf.name_pl AS family_name,
      COALESCE(c.title, cp.name) AS entity_name,
      COALESCE(c.nip, cp.nip) AS entity_nip,
      COALESCE(c.krs_legal_form, cp.krs_legal_form) AS legal_form,
      COALESCE(c.region, cp.wojewodztwo) AS region,
      c.id IS NOT NULL AS is_client
    FROM (
      SELECT DISTINCT ON (COALESCE(client_id, prospect_id))
        m1.*
      FROM matches m1
      JOIN products p1 ON p1.id = m1.product_id
      JOIN taxonomy_families tf1 ON tf1.id = p1.family_id
      WHERE m1.combined_score >= 60
        AND tf1.name_pl IN ('Kiszonki', 'Sałatki gotowe', 'Marynaty', 'Buraki / Warzywa konserwowane', 'Warzywa konserwowane', 'Sałatki')
      ORDER BY COALESCE(client_id, prospect_id), m1.combined_score DESC
    ) m
    JOIN products p ON p.id = m.product_id
    JOIN taxonomy_families tf ON tf.id = p.family_id
    LEFT JOIN clients c ON c.id = m.client_id
    LEFT JOIN ceidg_prospects cp ON cp.id = m.prospect_id
    WHERE (c.id IS NULL OR c.status NOT IN ('lost', 'odrzucony'))
    ORDER BY m.combined_score DESC
    LIMIT 30;
  `)
  console.log(`\n━━━ Cohort size: ${cohort.rows?.length ?? 0} ━━━`)
  if (!cohort.ok) {
    console.error('Cohort query error:', cohort.error)
    return
  }

  // Print formatted cohort
  console.log('\n#  | Score | Type     | Family            | Entity → Product')
  console.log('─'.repeat(100))
  const rows = (cohort.rows ?? []) as Array<{
    combined_score: number
    client_id: string | null
    prospect_id: string | null
    product_name: string
    family_name: string
    entity_name: string
    entity_nip: string
    legal_form: string | null
    region: string | null
    is_client: boolean
  }>
  rows.forEach((r, i) => {
    const type = r.is_client ? 'CLIENT' : 'PROSP '
    const fam = r.family_name.padEnd(18)
    const name = (r.entity_name ?? '').slice(0, 35).padEnd(35)
    const nip = r.entity_nip ?? '?'
    console.log(`${String(i + 1).padStart(2)} | ${r.combined_score} | ${type} | ${fam} | ${name} (${nip}) → ${r.product_name}`)
  })

  // Family breakdown
  console.log('\n━━━ Cohort family breakdown ━━━')
  const famCount = new Map<string, number>()
  for (const r of rows) famCount.set(r.family_name, (famCount.get(r.family_name) ?? 0) + 1)
  for (const [f, n] of famCount) console.log(`  ${f}: ${n}`)

  // Entity-type breakdown
  const clientCount = rows.filter((r) => r.is_client).length
  const prospectCount = rows.length - clientCount
  console.log(`\n━━━ Cohort by type ━━━`)
  console.log(`  Clients: ${clientCount}`)
  console.log(`  Prospects: ${prospectCount}`)

  // pkd_exact_match count
  console.log('\n━━━ Cohort з pkd_exact_match ━━━')
  const exactCount = rows.filter((r) => {
    const codes = (r as unknown as { reason_codes?: string[] }).reason_codes ?? []
    return codes.some((c) => c.startsWith('pkd_exact_match'))
  }).length
  console.log(`  ${exactCount}/${rows.length} entities з pkd_exact_match`)

  // Save cohort IDs до tmp file дla Phase B
  const cohortIds = rows.map((r) => ({
    id: r.client_id ?? r.prospect_id,
    type: r.is_client ? 'client' : 'prospect',
    name: r.entity_name,
    nip: r.entity_nip,
    score: r.combined_score,
    region: r.region,
    legal_form: r.legal_form,
  }))
  const fs = await import('node:fs/promises')
  await fs.writeFile('/tmp/sprint-n-cohort.json', JSON.stringify(cohortIds, null, 2))
  console.log(`\n💾 Cohort saved до /tmp/sprint-n-cohort.json (${cohortIds.length} entities)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
