// scripts/sprint-s2a-dedupe-persons.ts
// Sprint S2A Phase 1C — dedupe legacy 'krs_anon' placeholder persons z
// nowymi 'rejestrio_v2' real-name rows.
//
// Strategy:
//   For each (client_id, rola) у person_company_links:
//     IF exists rejestrio_v2 person → KEEP (real names)
//     IF only krs_anon person → KEEP (no Biznes data yet, leave intact)
//   For each rejestrio_v2 person — ensure linked do client (added у Sprint S1
//   но dla idempotency niech sprawdza).
//
// One-time migration. Safe to re-run.

import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  console.log('━━━ BEFORE ━━━')
  const before = await executeManagementSQL(`
    SELECT
      COALESCE(p.source, 'unknown') AS source,
      COUNT(*) AS persons,
      COUNT(DISTINCT pcl.client_id) AS clients
    FROM persons p
    LEFT JOIN person_company_links pcl ON pcl.person_id = p.id
    GROUP BY p.source
    ORDER BY persons DESC;
  `)
  console.log(JSON.stringify(before.rows, null, 2))

  // Find dupes: clients що mają BOTH a 'rejestrio_v2' person AND a 'krs_anon'
  // person dla tej samej rola.
  console.log('\n━━━ Finding krs_anon placeholders that have rejestrio_v2 replacements ━━━')
  const dupes = await executeManagementSQL(`
    WITH per_client_role AS (
      SELECT
        pcl.client_id,
        pcl.rola,
        BOOL_OR(p.source = 'rejestrio_v2') AS has_real,
        BOOL_OR(p.source = 'krs_anon' OR p.source IS NULL OR p.imie LIKE '(KRS%') AS has_anon
      FROM person_company_links pcl
      JOIN persons p ON p.id = pcl.person_id
      GROUP BY pcl.client_id, pcl.rola
    )
    SELECT COUNT(*) FILTER (WHERE has_real AND has_anon) AS dup_role_pairs
    FROM per_client_role;
  `)
  console.log(JSON.stringify(dupes.rows, null, 2))

  console.log('\n━━━ DELETE krs_anon person_company_links дla roles where rejestrio_v2 exists ━━━')
  const delLinks = await executeManagementSQL(`
    DELETE FROM person_company_links
    WHERE id IN (
      SELECT pcl.id
      FROM person_company_links pcl
      JOIN persons p ON p.id = pcl.person_id
      WHERE (p.source = 'krs_anon' OR p.source IS NULL OR p.imie LIKE '(KRS%')
        AND EXISTS (
          SELECT 1
          FROM person_company_links pcl2
          JOIN persons p2 ON p2.id = pcl2.person_id
          WHERE pcl2.client_id = pcl.client_id
            AND pcl2.rola = pcl.rola
            AND p2.source = 'rejestrio_v2'
        )
    )
    RETURNING id;
  `)
  console.log(`Deleted ${delLinks.rows?.length ?? 0} duplicate links`)

  console.log('\n━━━ DELETE orphaned placeholder persons (no remaining links) ━━━')
  const delPersons = await executeManagementSQL(`
    DELETE FROM persons
    WHERE (source = 'krs_anon' OR source IS NULL OR imie LIKE '(KRS%')
      AND id NOT IN (SELECT person_id FROM person_company_links WHERE person_id IS NOT NULL)
    RETURNING id, imie, nazwisko;
  `)
  console.log(`Deleted ${delPersons.rows?.length ?? 0} orphaned placeholder persons`)

  console.log('\n━━━ AFTER ━━━')
  const after = await executeManagementSQL(`
    SELECT
      COALESCE(p.source, 'unknown') AS source,
      COUNT(*) AS persons,
      COUNT(DISTINCT pcl.client_id) AS clients
    FROM persons p
    LEFT JOIN person_company_links pcl ON pcl.person_id = p.id
    GROUP BY p.source
    ORDER BY persons DESC;
  `)
  console.log(JSON.stringify(after.rows, null, 2))

  // KOZAK-specific verification
  console.log('\n━━━ KOZAK OLEK persons ━━━')
  const kozak = await executeManagementSQL(`
    SELECT p.imie, p.nazwisko, p.source, p.rejestrio_person_id, pcl.rola
    FROM persons p
    JOIN person_company_links pcl ON pcl.person_id = p.id
    JOIN clients c ON c.id = pcl.client_id
    WHERE c.nip = '7561993172';
  `)
  console.log(JSON.stringify(kozak.rows, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
