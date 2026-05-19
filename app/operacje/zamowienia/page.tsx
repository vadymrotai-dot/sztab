// app/operacje/zamowienia/page.tsx
// Sprint S-ORDER.1.C.1 (19.05.2026) — admin orders list view.
// Server Component fetches all orders + clients JOIN, delegates UI до OrdersList.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { OrdersList } from '@/components/operacje/orders-list'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function ZamowieniaPage() {
  // Auth check через anon client (cookies-based session)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Data fetch через admin client (bypass RLS — admin view має бачити всі orders)
  const admin = createAdminClient()
  const { data: orders, error } = await admin
    .from('orders')
    .select(
      `
      id, order_number, status, tier_at_submit,
      total_net, total_brutto,
      contact_person, contact_phone, contact_email,
      delivery_address, preferred_delivery_date,
      created_at, submitted_at, link_opened_at, confirmed_at,
      client:clients!inner(id, title, nip, city)
    `,
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Zamówienia</h1>
        <p className="text-rose-600">Błąd ładowania: {error.message}</p>
      </div>
    )
  }

  return <OrdersList orders={(orders as any) || []} />
}
