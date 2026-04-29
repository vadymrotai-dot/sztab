import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const persons = await executeManagementSQL(`
    SELECT pcl.rola, p.imie, p.nazwisko, pcl.zrodlo, pcl.jest_decyzyjny
    FROM person_company_links pcl
    JOIN persons p ON p.id = pcl.person_id
    WHERE pcl.client_id = 'ed4e12e5-e432-48f2-ba74-af930171a884';
  `)
  console.log('━━━ KOZAK Linked persons ━━━')
  console.log(JSON.stringify(persons.rows, null, 2))
}

main().catch(console.error)
