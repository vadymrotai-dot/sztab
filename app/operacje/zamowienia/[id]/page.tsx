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
      cennik_tier, price_mode,
      total_net, total_vat, total_brutto, vat_rate,
      contact_person, contact_phone, contact_email,
      delivery_address, preferred_delivery_date,
      delivery_mode, documents_mode,
      customer_notes, internal_notes,
      created_at, link_opened_at, submitted_at, confirmed_at, updated_at,
      access_token,
      proforma_fakturownia_id, proforma_fakturownia_number, proforma_pdf_url, proforma_created_at,
      vat_fakturownia_id, vat_fakturownia_number, vat_pdf_url, vat_created_at,
      client:clients!inner(id, title, nip, city, address, region),
      items:order_items(id, product_id, product_name_snapshot, gramatura_snapshot, qty, unit_price, line_total, delivery_point_id)
    `,
    )
    .eq('id', id)
    .maybeSingle()

  if (!order) notFound()

  // Sprint 3A — punkty dostawy (multipoint) dla widoku admin (render per punkt).
  // Dane KOMPLETNE w bazie (order_delivery_points + order_items.delivery_point_id) — tylko render.
  const { data: deliveryPoints } = await admin
    .from('order_delivery_points')
    .select(
      'id, label, ulica, kod_pocztowy, miasto, typ, termin_typ, preferred_date, odbiorca_imie, odbiorca_telefon',
    )
    .eq('order_id', id)
    .order('created_at', { ascending: true })

  // 3B-2b — order_documents (per-point proformy dla osobne). Render gating opiera się
  // na tych wierszach, NIE na orders.proforma_fakturownia_id (dla osobne zawsze NULL).
  const { data: orderDocuments } = await admin
    .from('order_documents')
    .select(
      'id, kind, scope, delivery_point_id, fakturownia_id, fakturownia_number, pdf_url, created_at',
    )
    .eq('order_id', id)
    .order('created_at', { ascending: true })

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
      deliveryPoints={(deliveryPoints as any) || []}
      orderDocuments={(orderDocuments as any) || []}
    />
  )
}
