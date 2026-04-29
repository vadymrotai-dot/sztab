import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const matches = await executeManagementSQL(`
    SELECT m.algo_score, m.reason_codes, m.computed_at, p.name AS product_name, tf.name_pl AS family
    FROM matches m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN taxonomy_families tf ON tf.id = p.family_id
    WHERE m.client_id = 'ed4e12e5-e432-48f2-ba74-af930171a884'
    ORDER BY m.algo_score DESC
    LIMIT 10;
  `)
  console.log('━━━ KOZAK matches (top 10) ━━━')
  console.log(JSON.stringify(matches.rows, null, 2))

  const stale = await executeManagementSQL(`
    SELECT
      MIN(computed_at) AS oldest,
      MAX(computed_at) AS newest,
      COUNT(*) AS total
    FROM matches
    WHERE client_id = 'ed4e12e5-e432-48f2-ba74-af930171a884';
  `)
  console.log('\n━━━ Match age ━━━')
  console.log(JSON.stringify(stale.rows, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
