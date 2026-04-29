import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const r = await executeManagementSQL(`
    SELECT
      (SELECT COUNT(*) FROM clients) AS clients,
      (SELECT COUNT(*) FROM clients WHERE pkd_2007_codes IS NOT NULL AND array_length(pkd_2007_codes, 1) > 0) AS clients_with_pkd,
      (SELECT COUNT(*) FROM ceidg_prospects) AS prospects,
      (SELECT COUNT(*) FROM ceidg_prospects WHERE pkd_main IS NOT NULL OR (pkd_all IS NOT NULL AND array_length(pkd_all, 1) > 0)) AS prospects_with_pkd,
      (SELECT COUNT(*) FROM ceidg_prospect_scores) AS prospects_scored,
      (SELECT MAX(horeca_meta_score) FROM ceidg_prospect_scores) AS top_score,
      (SELECT COUNT(*) FROM products WHERE family_id IS NOT NULL) AS products,
      (SELECT COUNT(*) FROM taxonomy_families) AS families;
  `)
  console.log(JSON.stringify(r.rows, null, 2))
}

main().catch(console.error)
