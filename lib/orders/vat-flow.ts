/**
 * VAT invoice background flow.
 *
 * Sprint S-ORDER.2.A.4 (21.05.2026) — mirror proforma-flow.ts pattern.
 *
 * Called fire-and-forget через after() з admin endpoint:
 *   after(async () => { await processVatInvoice(orderId) })
 *
 * Validations (defensive — endpoint вже перевіряє ці інваріанти):
 *  - order.status === 'shipped'
 *  - order.proforma_fakturownia_id IS NOT NULL (proforma must exist first)
 *  - order.vat_fakturownia_id IS NULL  (idempotent — already issued = skip)
 *
 * Steps:
 *  1. Fetch full order + items + client (via service-role)
 *  2. Validate gate (throws ProcessVatError якщо fail — caller after() catches)
 *  3. Create Fakturownia VAT invoice (KSeF auto-enabled via send_to_ksef default)
 *  4. Fetch PDF bytes (NULL OK — email можна послати без attachment fallback)
 *  5. UPDATE orders SET vat_fakturownia_id, vat_fakturownia_number, vat_pdf_url,
 *     vat_created_at, status='invoiced', updated_at
 *  6. sendNotification('email', 'order_vat_invoice') з PDF attached
 *
 * Failure semantics:
 *  - Validation fail → throw (idempotent skip → no work)
 *  - Fakturownia createInvoice fail → INSERT notification_log failed + throw
 *  - getInvoicePdf fail → log warn, продовжуємо без attachment
 *  - UPDATE fail → throw (VAT exists у Fakturownia + KSeF, але DB out of sync —
 *    Vadym має manual reconcile, протокол 11 з prompt)
 *  - sendNotification fail → НЕ throw (sender пише до notification_log sam, VAT
 *    вже у системі, KSeF знає, email можна re-send manually)
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  createInvoice,
  orderItemsToPositions,
  getInvoicePdf,
} from '@/lib/integrations/fakturownia'
import { sendNotification } from '@/lib/notifications/sender'

export class ProcessVatError extends Error {
  constructor(
    message: string,
    public code:
      | 'ORDER_NOT_FOUND'
      | 'WRONG_STATUS'
      | 'NO_PROFORMA'
      | 'ALREADY_INVOICED'
      | 'NO_EMAIL'
      | 'FAKTUROWNIA_CREATE_FAILED'
      | 'DB_UPDATE_FAILED',
  ) {
    super(message)
    this.name = 'ProcessVatError'
  }
}

export async function processVatInvoice(
  orderId: string,
  options?: { testMode?: boolean },
): Promise<void> {
  const admin = createAdminClient()
  const isTestMode = options?.testMode === true

  if (isTestMode) {
    console.warn(
      '[vat-flow] TEST MODE — send_to_ksef forced to false, KSeF submission skipped',
      { orderId },
    )
  }

  // 1. Fetch order
  const { data: order, error } = await admin
    .from('orders')
    .select(
      `
      id, order_number, status,
      total_net, total_vat, total_brutto,
      contact_person, contact_phone, contact_email, delivery_address,
      proforma_fakturownia_id, proforma_fakturownia_number,
      vat_fakturownia_id,
      client:clients!inner(id, title, nip, city, address, email, phone),
      items:order_items(product_name_snapshot, gramatura_snapshot, qty, unit_price, line_total)
    `,
    )
    .eq('id', orderId)
    .maybeSingle()

  if (error || !order) {
    console.error('[vat] order not found', orderId, error?.message)
    throw new ProcessVatError(
      `Order ${orderId} not found`,
      'ORDER_NOT_FOUND',
    )
  }

  // 2. Validate gate (defensive)
  const o = order as any
  if (o.status !== 'shipped') {
    throw new ProcessVatError(
      `Order ${o.order_number} status='${o.status}' (expected 'shipped')`,
      'WRONG_STATUS',
    )
  }
  if (!o.proforma_fakturownia_id) {
    throw new ProcessVatError(
      `Order ${o.order_number} has no proforma — issue proforma first`,
      'NO_PROFORMA',
    )
  }
  if (o.vat_fakturownia_id) {
    // Idempotent — VAT already issued, skip silently
    console.warn(
      '[vat] already issued, skipping',
      o.order_number,
      'vat_id=' + o.vat_fakturownia_id,
    )
    throw new ProcessVatError(
      `VAT already issued for ${o.order_number} (id=${o.vat_fakturownia_id})`,
      'ALREADY_INVOICED',
    )
  }

  const client = o.client
  const items = o.items as any[]
  const emailAddr = o.contact_email || client.email

  if (!emailAddr) {
    throw new ProcessVatError(
      `Order ${o.order_number} has no email recipient`,
      'NO_EMAIL',
    )
  }

  // 3. Create Fakturownia VAT.
  // Production: send_to_ksef defaults to isVAT=true (KSeF auto-enabled per Feb 2026 ustawa).
  // Test mode: explicit `send_to_ksef: false` — VAT created у Fakturownia (real запис),
  // але НЕ submitted до KSeF (фіскальний registry — не можна заповнити test data).
  let vat
  try {
    vat = await createInvoice({
      kind: 'vat',
      buyer: {
        name: client.title,
        tax_no: client.nip,
        street: o.delivery_address || client.address,
        city: client.city,
        email: emailAddr,
        phone: o.contact_phone || client.phone,
        country: 'PL',
      },
      positions: orderItemsToPositions(items),
      payment_to_days: 14,
      external_order_id: o.order_number,
      description: `Faktura VAT do zamówienia ${o.order_number}`,
      ...(isTestMode ? { send_to_ksef: false } : {}),
    })
  } catch (e: any) {
    console.error('[vat] Fakturownia createInvoice failed', {
      orderId,
      orderNumber: o.order_number,
      error: e?.message,
    })
    // Audit entry для UI visibility
    await admin.from('notification_log').insert({
      order_id: orderId,
      client_id: client.id,
      channel: 'email',
      recipient: emailAddr,
      template: 'order_vat_invoice',
      status: 'failed',
      error_message: `Fakturownia VAT create failed: ${e?.message}`,
    })
    throw new ProcessVatError(
      `Fakturownia create failed: ${e?.message}`,
      'FAKTUROWNIA_CREATE_FAILED',
    )
  }

  // 4. Fetch PDF (NULL OK — email can send without attachment fallback)
  let pdfBytes: Buffer | null = null
  try {
    pdfBytes = await getInvoicePdf(vat.id)
  } catch (e: any) {
    console.error('[vat] PDF fetch failed', {
      orderId,
      vatId: vat.id,
      error: e?.message,
    })
  }

  // 5. UPDATE orders: vat_* + auto-move status shipped → invoiced
  const nowIso = new Date().toISOString()
  const { error: updErr } = await admin
    .from('orders')
    .update({
      vat_fakturownia_id: vat.id,
      vat_fakturownia_number: vat.number,
      vat_pdf_url: vat.view_url, // Fakturownia direct URL (parity з proforma)
      vat_created_at: nowIso,
      status: 'invoiced', // auto-transition shipped → invoiced
      updated_at: nowIso,
    })
    .eq('id', orderId)

  if (updErr) {
    console.error('[vat] DB UPDATE failed', {
      orderId,
      vatId: vat.id,
      error: updErr.message,
    })
    // VAT existуй у Fakturownia + KSeF, але DB out of sync.
    // Vadym manual reconcile required.
    throw new ProcessVatError(
      `DB update failed after Fakturownia create (vat_id=${vat.id}): ${updErr.message}`,
      'DB_UPDATE_FAILED',
    )
  }

  // 6. Send email through notification sender (sender пише до notification_log sam)
  const result = await sendNotification({
    channel: 'email',
    recipient: { email: emailAddr },
    template: 'order_vat_invoice',
    order_id: orderId,
    client_id: client.id,
    data: {
      order_number: o.order_number,
      client_name: client.title,
      contact_person: o.contact_person,
      vat_number: vat.number,
      total_brutto: Number(o.total_brutto),
      total_net: Number(o.total_net),
      vat_amount: Number(o.total_vat),
      vat_view_url: vat.view_url,
    },
    attachments: pdfBytes
      ? [
          {
            filename: `Faktura-VAT-${vat.number.replace(/\//g, '-')}.pdf`,
            content: pdfBytes,
            contentType: 'application/pdf',
          },
        ]
      : undefined,
  })

  if (!result.ok) {
    // Не throw — VAT exists, KSeF знає, тільки email failed. Vadym retry manually.
    console.warn('[vat] email send failed (VAT already issued)', {
      orderId,
      vatNumber: vat.number,
      error: result.error,
    })
  }
}
