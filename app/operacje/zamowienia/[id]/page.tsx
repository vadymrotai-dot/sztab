// app/operacje/zamowienia/[id]/page.tsx
// Sprint S-ORDER.1.C.2 (19.05.2026) — admin order detail view.
// Server Component fetches single order + items + client, delegates UI до OrderDetail.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { OrderDetail } from '@/components/operacje/order-detail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Auth check через anon client (cookies-based session)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Data fetch через admin client (bypass RLS — admin view)
  const admin = createAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select(
      `
      id, order_number, status, tier_at_submit,
      total_net, total_vat, total_brutto, vat_rate,
      contact_person, contact_phone, contact_email,
      delivery_address, preferred_delivery_date,
      customer_notes, internal_notes,
      created_at, link_opened_at, submitted_at, confirmed_at, updated_at,
      access_token,
      client:clients!inner(id, title, nip, city, address, region),
      items:order_items(id, product_name_snapshot, gramatura_snapshot, qty, unit_price, line_total)
    `,
    )
    .eq('id', id)
    .maybeSingle()

  if (!order) notFound()

  return <OrderDetail order={order as any} />
}
