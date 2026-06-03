// app/api/orders/admin/[id]/send-proforma/route.ts
// Sprint T-ORDER.1 (30.05.2026) — admin manual proforma send endpoint.
//
// POST /api/orders/admin/[id]/send-proforma
//   - Auth required (cookies-based session, mirror issue-vat-invoice pattern)
//   - Validates: order exists, status NOT cancelled, proforma_fakturownia_id IS NULL
//     (idempotent — nie wysyłaj drugi raz)
//   - Returns 200 immediately + after() wraps processProforma (Vercel reliability)
//   - Background task: Fakturownia create + PDF + UPDATE orders.proforma_* + email
//
// Wcześniej (S-ORDER.2.A.3 → T-ORDER.1) proforma była wysyłana automatycznie
// w submit/route.ts przez after(). Decyzja T-ORDER.1: ręczny sygnał Vadyma
// w panelu zamówienia po telefonicznym potwierdzeniu.
//
// 409 conflict якщо вже wysłana (idempotent — UI ukrywa przycisk).
// 400 якщо order cancelled / no email.

import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processProforma } from '@/lib/orders/proforma-flow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const UUID_RE = /^[0-9a-f-]{36}$/i

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawne ID zamówienia' },
      { status: 400 },
    )
  }

  // Auth gate — cookies-based session, mirror issue-vat-invoice pattern.
  // T-ORDER.1 nie potrzebuje test-mode bypass (proforma nie idzie do KSeF).
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

  // Validate order state перед launching background task.
  const admin = createAdminClient()
  const { data: order, error } = await admin
    .from('orders')
    .select(
      'id, order_number, status, proforma_fakturownia_id, contact_email, documents_mode',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[send-proforma] DB load failed:', error.message)
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
  if (order.status === 'cancelled') {
    return NextResponse.json(
      {
        ok: false,
        error: 'Nie można wysłać proformy dla anulowanego zamówienia',
      },
      { status: 400 },
    )
  }
  if (order.proforma_fakturownia_id) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Faktura proforma już została wysłana',
      },
      { status: 409 },
    )
  }
  if (!order.contact_email) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Brak adresu email klienta — nie ma gdzie wysłać proformy',
      },
      { status: 400 },
    )
  }

  // ─── 3B-2b — IDEMPOTENCY OSOBNE: stan w order_documents (NIE w kolumnie) ───
  // documents_mode='osobne' → proforma_fakturownia_id zawsze NULL (per-point docs
  // żyją w order_documents). Gate wyżej (proforma_fakturownia_id) nie chroni osobne,
  // więc tu liczymy proform-rows vs liczba punktów:
  //   - wszystkie wystawione (count >= punkty) → 409 OD RAZU, BEZ after() (kasuje 30s hang)
  //   - część (np. 1 z 2) → pozwól (processProforma osobne dośle brakujące via donePoints)
  // Single-flow (wspolna) NIE wchodzi tu — używa gate proforma_fakturownia_id wyżej.
  if (order.documents_mode === 'osobne') {
    const { count: pointCount } = await admin
      .from('order_delivery_points')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', id)
    const { count: proformaCount } = await admin
      .from('order_documents')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', id)
      .eq('kind', 'proforma')
    if ((pointCount ?? 0) > 0 && (proformaCount ?? 0) >= (pointCount ?? 0)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Proformy już wysłane (wszystkie punkty dostawy)',
        },
        { status: 409 },
      )
    }
  }

  // Background task: Fakturownia create + PDF + UPDATE orders.proforma_* + email.
  // Pattern z S-ORDER.2.A.3.2 (after() from next/server) — guarantees task до
  // ~30s post-response на Vercel. Local dev: no-op wrapper, executes inline.
  // processProforma sam loguje failures do notification_log + console.error,
  // nigdy nie throws. Tu catch tylko на wszelki wypadek (defense in depth).
  after(async () => {
    try {
      await processProforma(id)
    } catch (err: any) {
      console.error('[send-proforma] processProforma background task failed', {
        orderId: id,
        orderNumber: order.order_number,
        error: err?.message,
      })
    }
  })

  return NextResponse.json({
    ok: true,
    message: 'Wysyłanie faktury proforma uruchomione w tle',
    order_number: order.order_number,
  })
}
