/**
 * Proforma background flow.
 *
 * Sprint S-ORDER.2.A.3 (19.05.2026) — extract з submit route.
 *
 * Called fire-and-forget (no await) після successful submit:
 *   processProforma(orderId).catch(err => console.error(...))
 *
 * Steps:
 *  1. Fetch full order + items + client (via service-role)
 *  2. Create Fakturownia proforma
 *  3. Fetch PDF bytes
 *  4. UPDATE orders.proforma_*
 *  5. sendNotification('email', 'order_proforma') з PDF attached
 *
 * Никогда не throws — errors logged до console.error + notification_log.
 * Re-usable: submit endpoint + manual "resend proforma" button у admin.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  createInvoice,
  orderItemsToPositions,
  mergeItemsByProduct,
  getInvoicePdf,
} from '@/lib/integrations/fakturownia'
import { sendNotification } from '@/lib/notifications/sender'

export async function processProforma(orderId: string): Promise<void> {
  const admin = createAdminClient()

  // 1. Fetch order
  const { data: order, error } = await admin
    .from('orders')
    .select(
      `
      id, order_number, total_net, total_vat, total_brutto,
      contact_person, contact_phone, contact_email, delivery_address, documents_mode,
      client:clients!inner(id, title, nip, city, address, email, phone),
      items:order_items(product_id, delivery_point_id, product_name_snapshot, gramatura_snapshot, qty, unit_price, line_total, product:products(vat_rate))
    `,
    )
    .eq('id', orderId)
    .maybeSingle()

  if (error || !order) {
    console.error('[proforma] order not found', orderId, error?.message)
    return
  }

  const client = (order as any).client
  // 3B-1 — spłaszcz vat_rate (z products) + złącz po product_id (dokument wspólny).
  const rawItems = ((order as any).items as any[]).map((it) => ({
    product_id: it.product_id,
    delivery_point_id: it.delivery_point_id,
    product_name_snapshot: it.product_name_snapshot,
    gramatura_snapshot: it.gramatura_snapshot,
    qty: it.qty,
    unit_price: it.unit_price,
    line_total: it.line_total,
    vat_rate: it.product?.vat_rate ?? null,
  }))
  const items = mergeItemsByProduct(rawItems)
  const emailAddr = (order as any).contact_email || client.email

  if (!emailAddr) {
    console.warn('[proforma] no email — skipping notification', orderId)
    return
  }

  // ─── 3B-2a — DOKUMENTY OSOBNE: N proform, jedna na każdy punkt dostawy ───
  // documents_mode='osobne' → pętla po order_delivery_points. Idempotency per-point
  // (order_documents). Single-flow (wspolna) niżej BEZ ZMIAN.
  if ((order as any).documents_mode === 'osobne') {
    const { data: pointsData } = await admin
      .from('order_delivery_points')
      .select('id, label, ulica, kod_pocztowy, miasto')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
    const points = (pointsData ?? []) as Array<{
      id: string
      label: string | null
      ulica: string | null
      kod_pocztowy: string | null
      miasto: string | null
    }>

    if (points.length > 0) {
      // Idempotency — punkty które już mają proformę (order_documents).
      const { data: existingDocs } = await admin
        .from('order_documents')
        .select('delivery_point_id')
        .eq('order_id', orderId)
        .eq('kind', 'proforma')
      const donePoints = new Set(
        (existingDocs ?? []).map((d: any) => d.delivery_point_id as string),
      )

      const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
      let anyCreated = false

      for (let idx = 0; idx < points.length; idx++) {
        const pt = points[idx]!
        if (donePoints.has(pt.id)) continue // już wystawiona — pomiń

        // Pozycje TEGO punktu (filter po delivery_point_id) + merge w obrębie punktu.
        const ptRaw = rawItems.filter((it: any) => it.delivery_point_id === pt.id)
        if (ptRaw.length === 0) continue
        const ptItems = mergeItemsByProduct(ptRaw)

        const ptAddr = [pt.ulica, [pt.kod_pocztowy, pt.miasto].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', ')
        const ptLabel = pt.label || `Punkt ${idx + 1}`

        let inv
        try {
          inv = await createInvoice({
            kind: 'proforma',
            buyer: {
              name: client.title,
              tax_no: client.nip,
              // Buyer = klient (billing po NIP). Adres punktu → description, NIE buyer.street.
              street: client.address,
              city: client.city,
              email: emailAddr,
              phone: (order as any).contact_phone || client.phone,
              country: 'PL',
            },
            positions: orderItemsToPositions(ptItems),
            payment_to_days: 14,
            external_order_id: (order as any).order_number,
            description: `Zamówienie ${(order as any).order_number} — Punkt ${idx + 1}: ${ptLabel}${ptAddr ? `, ${ptAddr}` : ''}`,
          })
        } catch (e: any) {
          console.error('[proforma][osobne] createInvoice failed', {
            orderId,
            pointId: pt.id,
            error: e?.message,
          })
          await admin.from('notification_log').insert({
            order_id: orderId,
            client_id: client.id,
            channel: 'email',
            recipient: emailAddr,
            template: 'order_proforma',
            status: 'failed',
            error_message: `Fakturownia create failed (punkt ${idx + 1}): ${e?.message}`,
          })
          continue // próbuj kolejne punkty
        }

        let ptPdf: Buffer | null = null
        try {
          ptPdf = await getInvoicePdf(inv.id)
        } catch (e: any) {
          console.error('[proforma][osobne] PDF fetch failed', {
            orderId,
            pointId: pt.id,
            invId: inv.id,
            error: e?.message,
          })
        }

        // INSERT order_documents — jeden wiersz per punkt.
        await admin.from('order_documents').insert({
          order_id: orderId,
          delivery_point_id: pt.id,
          kind: 'proforma',
          scope: 'point',
          fakturownia_id: inv.id,
          fakturownia_number: inv.number,
          pdf_url: inv.view_url,
        })
        anyCreated = true
        if (ptPdf) {
          attachments.push({
            filename: `Faktura-Proforma-${inv.number.replace(/\//g, '-')}.pdf`,
            content: ptPdf,
            contentType: 'application/pdf',
          })
        }
      }

      // JEDEN email do klienta z N PDF (tylko gdy coś nowego wystawiono).
      if (anyCreated) {
        const paymentToDate = new Date()
        paymentToDate.setDate(paymentToDate.getDate() + 14)
        await sendNotification({
          channel: 'email',
          recipient: { email: emailAddr },
          template: 'order_proforma',
          order_id: orderId,
          client_id: client.id,
          data: {
            order_number: (order as any).order_number,
            client_name: client.title,
            contact_person: (order as any).contact_person,
            proforma_number: `${attachments.length} proform (osobne per punkt)`,
            total_brutto: Number((order as any).total_brutto),
            total_net: Number((order as any).total_net),
            vat_amount: Number((order as any).total_vat),
            payment_to_days: 14,
            payment_to_date: paymentToDate.toISOString().split('T')[0],
            proforma_view_url: '',
          },
          attachments: attachments.length > 0 ? attachments : undefined,
        })
      }
      return // osobne obsłużone — NIE wykonuj single-flow poniżej.
    }
    // osobne ale brak punktów → fallback do single-flow (wspólny) niżej.
  }

  // 2. Create Fakturownia proforma
  let proforma
  try {
    proforma = await createInvoice({
      kind: 'proforma',
      buyer: {
        name: client.title,
        tax_no: client.nip,
        street: (order as any).delivery_address || client.address,
        city: client.city,
        email: emailAddr,
        phone: (order as any).contact_phone || client.phone,
        country: 'PL',
      },
      positions: orderItemsToPositions(items),
      payment_to_days: 14,
      external_order_id: (order as any).order_number,
      description: `Zamówienie online ${(order as any).order_number}`,
    })
  } catch (e: any) {
    console.error('[proforma] Fakturownia createInvoice failed', {
      orderId,
      error: e?.message,
    })
    // Audit log entry для visibility (failed status)
    await admin.from('notification_log').insert({
      order_id: orderId,
      client_id: client.id,
      channel: 'email',
      recipient: emailAddr,
      template: 'order_proforma',
      status: 'failed',
      error_message: `Fakturownia create failed: ${e?.message}`,
    })
    return
  }

  // 3. Fetch PDF (NULL OK — email can send without attachment)
  let pdfBytes: Buffer | null = null
  try {
    pdfBytes = await getInvoicePdf(proforma.id)
  } catch (e: any) {
    console.error('[proforma] PDF fetch failed', {
      orderId,
      proformaId: proforma.id,
      error: e?.message,
    })
  }

  // 4. UPDATE orders.proforma_*
  await admin
    .from('orders')
    .update({
      proforma_fakturownia_id: proforma.id,
      proforma_fakturownia_number: proforma.number,
      proforma_pdf_url: proforma.view_url,
      proforma_created_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  // 5. Send email through notification sender
  const paymentToDate = new Date()
  paymentToDate.setDate(paymentToDate.getDate() + 14)

  await sendNotification({
    channel: 'email',
    recipient: { email: emailAddr },
    template: 'order_proforma',
    order_id: orderId,
    client_id: client.id,
    data: {
      order_number: (order as any).order_number,
      client_name: client.title,
      contact_person: (order as any).contact_person,
      proforma_number: proforma.number,
      total_brutto: Number((order as any).total_brutto),
      total_net: Number((order as any).total_net),
      vat_amount: Number((order as any).total_vat),
      payment_to_days: 14,
      payment_to_date: paymentToDate.toISOString().split('T')[0],
      proforma_view_url: proforma.view_url,
    },
    attachments: pdfBytes
      ? [
          {
            filename: `Faktura-Proforma-${proforma.number.replace(/\//g, '-')}.pdf`,
            content: pdfBytes,
            contentType: 'application/pdf',
          },
        ]
      : undefined,
  })
}
