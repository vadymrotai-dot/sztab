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

  // Test mode detection: query param ?testMode=true + x-test-token header
  // matching env SZTAB_TEST_TOKEN. Bypasses auth + forces send_to_ksef=false
  // у processVatInvoice. Дозволяє smoke test без real KSeF submission.
  // Both query AND header required — neither alone enables test mode.
  const testModeParam = req.nextUrl.searchParams.get('testMode') === 'true'
  const testTokenHeader = req.headers.get('x-test-token')
  const expectedTestToken = process.env.SZTAB_TEST_TOKEN
  const isTestMode =
    testModeParam &&
    !!testTokenHeader &&
    !!expectedTestToken &&
    testTokenHeader === expectedTestToken

  if (testModeParam && !isTestMode) {
    return NextResponse.json(
      { ok: false, error: 'Test mode requires valid x-test-token header' },
      { status: 401 },
    )
  }

  // Auth gate — bypass якщо test mode authenticated через TEST_TOKEN
  if (!isTestMode) {
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
      await processVatInvoice(id, { testMode: isTestMode })
    } catch (err: any) {
      console.error('[issue-vat] processVatInvoice background task failed', {
        orderId: id,
        orderNumber: order.order_number,
        testMode: isTestMode,
        code: err?.code,
        error: err?.message,
      })
    }
  })

  if (isTestMode) {
    console.warn('[issue-vat] TEST MODE active — bypassing auth + KSeF skip', {
      orderId: id,
      orderNumber: order.order_number,
    })
  }

  return NextResponse.json({
    ok: true,
    message: isTestMode
      ? 'TEST MODE — Wystawianie faktury VAT uruchomione w tle (KSeF skip)'
      : 'Wystawianie faktury VAT uruchomione w tle',
    order_number: order.order_number,
    test_mode: isTestMode,
  })
}
