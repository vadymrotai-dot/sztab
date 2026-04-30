import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

async function main() {
  console.log('Replacing partial UNIQUE з regular UNIQUE constraint на persons.rejestrio_person_id...')
  const r = await executeManagementSQL(`
    DROP INDEX IF EXISTS idx_persons_rejestrio_id_uniq;
    ALTER TABLE persons DROP CONSTRAINT IF EXISTS persons_rejestrio_uniq;
    ALTER TABLE persons ADD CONSTRAINT persons_rejestrio_uniq UNIQUE (rejestrio_person_id);
  `)
  console.log(r.ok ? '✅ Applied' : `❌ ${r.error}`)
}

main().catch(console.error)
