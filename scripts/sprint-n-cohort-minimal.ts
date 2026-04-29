import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

const FAM = `(tf.name_pl = 'Kiszonki' OR tf.name_pl = 'Sałatki gotowe' OR tf.name_pl = 'Marynaty')`

async function main() {
  // Simplest possible: top 30 ChM-relevant matches з name lookup
  const r = await executeManagementSQL(`
    SELECT
      m.combined_score,
      m.client_id,
      m.prospect_id,
      m.reason_codes,
      p.name AS product_name,
      tf.name_pl AS family_name,
      COALESCE(c.title, cp.name) AS entity_name,
      COALESCE(c.nip, cp.nip) AS entity_nip
    FROM matches m
    JOIN products p ON p.id = m.product_id
    JOIN taxonomy_families tf ON tf.id = p.family_id
    LEFT JOIN clients c ON c.id = m.client_id
    LEFT JOIN ceidg_prospects cp ON cp.id = m.prospect_id
    WHERE m.combined_score >= 60
      AND ${FAM}
    ORDER BY m.combined_score DESC
    LIMIT 30;
  `)
  console.log('rows:', r.rows?.length, 'ok:', r.ok, 'error:', r.error)
  console.log(JSON.stringify(r.rows, null, 2))
}

main().catch(console.error)
