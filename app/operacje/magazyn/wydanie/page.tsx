// app/operacje/magazyn/wydanie/page.tsx — Ф2 (server)
// Ręczne wydanie magazynowe (WZ/RW). Ładuje towary magazynowe + klient.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getWarehouseManagedProducts,
  getWarehouseClients,
} from '@/lib/orders/warehouse-issue'
import { WydanieClient } from './wydanie-client'

export const dynamic = 'force-dynamic'

export default async function WydaniePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [products, clients] = await Promise.all([
    getWarehouseManagedProducts(),
    getWarehouseClients(),
  ])
  return <WydanieClient products={products as any} clients={clients as any} />
}
