/**
 * S-ORDER.2.A.2 smoke test endpoint.
 *
 * Usage: POST /api/test-fakturownia з { order_id: "..." }
 * Behavior: створює proforma у Fakturownia для existing order + sends email
 *           + updates orders.proforma_*.
 *
 * TEMP endpoint — буде видалено у 2.A.3 коли hook у submit готовий.
 * Auth: requires logged-in user (cookies).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createInvoice,
  orderItemsToPositions,
  getInvoicePdf,
} from '@/lib/integrations/fakturownia'
import { sendNotification } from '@/lib/notifications/sender'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const body = await req.json().catch(() => ({}))
  if (!body.order_id) {
    return NextResponse.json(
      { ok: false, error: 'order_id required' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // Fetch order з items + client
  const { data: order, error } = await admin
    .from('orders')
    .select(
      `
      id, order_number, status,
      total_net, total_vat, total_brutto,
      contact_person, contact_phone, contact_email,
      delivery_address,
      client:clients!inner(id, title, nip, city, address, email, phone),
      items:order_items(product_name_snapshot, gramatura_snapshot, qty, unit_price, line_total)
    `,
    )
    .eq('id', body.order_id)
    .maybeSingle()

  if (error || !order) {
    return NextResponse.json(
      { ok: false, error: 'Order not found', details: error?.message },
      { status: 404 },
    )
  }

  const client = order.client as any
  const items = order.items as any[]

  if (!order.contact_email && !client.email) {
    return NextResponse.json(
      { ok: false, error: 'No email address для recipient' },
      { status: 400 },
    )
  }

  try {
    // Create proforma у Fakturownia
    const proforma = await createInvoice({
      kind: 'proforma',
      buyer: {
        name: client.title,
        tax_no: client.nip,
        street: order.delivery_address || client.address,
        city: client.city,
        email: order.contact_email || client.email,
        phone: order.contact_phone || client.phone,
        country: 'PL',
      },
      positions: orderItemsToPositions(items),
      payment_to_days: 14,
      external_order_id: order.order_number,
      description: `Zamówienie online ${order.order_number}`,
    })

    // Fetch PDF
    const pdfBytes = await getInvoicePdf(proforma.id)

    // Update orders
    await admin
      .from('orders')
      .update({
        proforma_fakturownia_id: proforma.id,
        proforma_fakturownia_number: proforma.number,
        proforma_pdf_url: proforma.view_url,
        proforma_created_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    // Compute payment_to date
    const paymentToDate = new Date()
    paymentToDate.setDate(paymentToDate.getDate() + 14)

    // Send email
    const emailResult = await sendNotification({
      channel: 'email',
      recipient: { email: order.contact_email || client.email },
      template: 'order_proforma',
      order_id: order.id,
      client_id: client.id,
      data: {
        order_number: order.order_number,
        client_name: client.title,
        contact_person: order.contact_person,
        proforma_number: proforma.number,
        total_brutto: Number(order.total_brutto),
        total_net: Number(order.total_net),
        vat_amount: Number(order.total_vat),
        payment_to_days: 14,
        payment_to_date: paymentToDate.toISOString().split('T')[0],
        proforma_view_url: proforma.view_url,
      },
      attachments: [
        {
          filename: `Faktura-Proforma-${proforma.number.replace(/\//g, '-')}.pdf`,
          content: pdfBytes,
          contentType: 'application/pdf',
        },
      ],
    })

    return NextResponse.json({
      ok: true,
      proforma: {
        id: proforma.id,
        number: proforma.number,
        view_url: proforma.view_url,
      },
      email: emailResult,
    })
  } catch (e: any) {
    console.error('[test-fakturownia]', e?.message)
    return NextResponse.json(
      { ok: false, error: e?.message },
      { status: 500 },
    )
  }
}
