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
      proforma_fakturownia_id, proforma_fakturownia_number, proforma_pdf_url, proforma_created_at,
      vat_fakturownia_id, vat_fakturownia_number, vat_pdf_url, vat_created_at,
      client:clients!inner(id, title, nip, city, address, region),
      items:order_items(id, product_name_snapshot, gramatura_snapshot, qty, unit_price, line_total)
    `,
    )
    .eq('id', id)
    .maybeSingle()

  if (!order) notFound()

  // S-ORDER.1.C.3 — fetch 17 SKU для add-item modal у edit mode
  // Sprint S-CENNIK-WH.1 — also price_duzi_gracze для wielki_hurt orders
  const { data: availableProducts } = await admin
    .from('products')
    .select(
      'id, name, display_name, gramatura, order_form_sort, price_maly_opt, price_sredni, price_duzy, price_duzi_gracze',
    )
    .eq('show_in_orders', true)
    .order('order_form_sort', { ascending: true })

  return (
    <OrderDetail
      order={order as any}
      availableProducts={(availableProducts as any) || []}
    />
  )
}
