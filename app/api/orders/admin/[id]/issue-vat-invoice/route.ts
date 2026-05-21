// app/api/orders/admin/[id]/issue-vat-invoice/route.ts
// Sprint S-ORDER.2.A.4 (21.05.2026) — admin VAT invoice issue endpoint.
//
// POST /api/orders/admin/[id]/issue-vat-invoice
//   - Auth required (cookies-based session, mirror admin/[id]/route.ts pattern)
//   - Validates order: status='shipped', proforma exists, vat NOT yet issued
//   - Returns 200 immediately + after() wraps processVatInvoice (Vercel reliability)
//   - Background task: Fakturownia VAT create + PDF + UPDATE orders + email
//   - Status moves shipped → invoiced automatically у processVatInvoice
//
// 409 conflict якщо вже виставлена (idempotent — UI ховає кнопку).
// 400 якщо wrong status / no proforma.

import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processVatInvoice } from '@/lib/orders/vat-flow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const UUID_RE = /^[0-9a-f-]{36}$/i

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawne ID zamówienia' },
      { status: 400 },
    )
  }

  // Auth gate (mirror /api/orders/admin/[id]/route.ts)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Nieautoryzowany' },
      { status: 401 },
    )
  }

  // Validate order state перед launching background task
  const admin = createAdminClient()
  const { data: order, error } = await admin
    .from('orders')
    .select(
      'id, order_number, status, proforma_fakturownia_id, vat_fakturownia_id, contact_email',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[issue-vat] DB load failed:', error.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd bazy danych' },
      { status: 500 },
    )
  }
  if (!order) {
    return NextResponse.json(
      { ok: false, error: 'Zamówienie nie znalezione' },
      { status: 404 },
    )
  }
  if (order.status !== 'shipped') {
    return NextResponse.json(
      {
        ok: false,
        error: `Fakturę VAT można wystawić tylko po statusie "Wysłane" (obecny: "${order.status}")`,
      },
      { status: 400 },
    )
  }
  if (!order.proforma_fakturownia_id) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Brak faktury proforma — najpierw musi zostać wystawiona proforma',
      },
      { status: 400 },
    )
  }
  if (order.vat_fakturownia_id) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Faktura VAT już została wystawiona',
      },
      { status: 409 },
    )
  }
  if (!order.contact_email) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Brak adresu email klienta — nie ma gdzie wysłać faktury',
      },
      { status: 400 },
    )
  }

  // Background task: Fakturownia VAT create + PDF + UPDATE + email.
  // Per Sprint S-ORDER.2.A.3.2 pattern (after() from next/server для Vercel
  // reliability — guarantees task до ~30s post-response).
  after(async () => {
    try {
      await processVatInvoice(id)
    } catch (err: any) {
      console.error('[issue-vat] processVatInvoice background task failed', {
        orderId: id,
        orderNumber: order.order_number,
        code: err?.code,
        error: err?.message,
      })
    }
  })

  return NextResponse.json({
    ok: true,
    message: 'Wystawianie faktury VAT uruchomione w tle',
    order_number: order.order_number,
  })
}
