// app/operacje/magazyn/import/page.tsx — Ф3.1 (server)
// Ładuje listę dostawców i renderuje klienta importu faktury zakupowej.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ImportClient } from './import-client'

export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name')
    .order('name')

  return <ImportClient suppliers={(suppliers ?? []) as { id: string; name: string }[]} />
}
