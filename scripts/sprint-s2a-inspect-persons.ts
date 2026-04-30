import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  const r = await executeManagementSQL(`
    SELECT id, imie, nazwisko, source, rejestrio_person_id
    FROM persons
    WHERE source = 'rejestrio_v2' OR rejestrio_person_id IS NOT NULL;
  `)
  console.log('rejestrio persons:')
  console.log(JSON.stringify(r.rows, null, 2))
  const r2 = await executeManagementSQL(`
    SELECT pcl.id, pcl.client_id, pcl.person_id, pcl.rola, p.imie, p.nazwisko, p.source
    FROM person_company_links pcl
    JOIN persons p ON p.id = pcl.person_id
    JOIN clients c ON c.id = pcl.client_id
    WHERE c.nip = '7561993172';
  `)
  console.log('\nKOZAK links:')
  console.log(JSON.stringify(r2.rows, null, 2))
}
main().catch(console.error)
