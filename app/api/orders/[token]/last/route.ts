// app/api/orders/[token]/last/route.ts
// Sprint T-ORDER.4a-SHELL (30.05.2026) — "Powtórz zamówienie" endpoint.
//
// GET /api/orders/[token]/last
//   - Walidacja access_token bieżącego order (publiczny dostęp jak inne
//     /[token]/* routes).
//   - Resolve client_id z bieżącego order.
//   - SELECT ostatnie SUBMITTED zamówienie tego client_id (ORDER submitted_at DESC LIMIT 1).
//   - SELECT order_items dla tego zamówienia (product_id, qty).
//   - Filter z aktualnymi products: pomija nieistniejące + in_stock=false + show_in_orders=false.
//   - Zwraca { items: [{product_id, qty}], skipped: number, source_order_number: string }.
//
// Service-role admin client (orders + order_items RLS Option B service-role only).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

type RouteContext = { params: Promise<{ token: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { token } = await ctx.params
  if (!UUID_RE.test(token)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny token' },
      { status: 400 },
    )
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e: any) {
    console.error('[orders][token][last] admin init failed:', e?.message)
    return NextResponse.json(
      { ok: false, error: 'Configuration error' },
      { status: 500 },
    )
  }

  // 1. Resolve client_id z bieżącego order (access_token validation).
  const { data: currentOrder, error: loadErr } = await admin
    .from('orders')
    .select('client_id')
    .eq('access_token', token)
    .maybeSingle()
  if (loadErr) {
    console.error('[orders][token][last] current order load failed:', loadErr.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd bazy danych' },
      { status: 500 },
    )
  }
  if (!currentOrder) {
    return NextResponse.json(
      { ok: false, error: 'Zamówienie nie znalezione' },
      { status: 404 },
    )
  }

  // 2. Find ostatnie SUBMITTED zamówienie tego client_id (NOT cancelled / draft).
  const { data: lastOrder, error: lastErr } = await admin
    .from('orders')
    .select('id, order_number, submitted_at')
    .eq('client_id', currentOrder.client_id)
    .not('submitted_at', 'is', null)
    .neq('status', 'cancelled')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastErr) {
    console.error('[orders][token][last] last order query failed:', lastErr.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd bazy danych' },
      { status: 500 },
    )
  }
  if (!lastOrder) {
    return NextResponse.json(
      { ok: true, items: [], skipped: 0, source_order_number: null, has_history: false },
    )
  }

  // 3. SELECT items + JOIN products dla filter in_stock + show_in_orders.
  const { data: items, error: itemsErr } = await admin
    .from('order_items')
    .select('product_id, qty, product:products!inner(id, in_stock, show_in_orders)')
    .eq('order_id', lastOrder.id)
  if (itemsErr) {
    console.error('[orders][token][last] items query failed:', itemsErr.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd bazy danych' },
      { status: 500 },
    )
  }

  // 4. Filter — pomija jeśli product not found, !in_stock lub !show_in_orders.
  type ItemRow = {
    product_id: string
    qty: number
    product: { id: string; in_stock: boolean | null; show_in_orders: boolean | null } | null
  }
  const allItems = (items ?? []) as unknown as ItemRow[]
  const valid: Array<{ product_id: string; qty: number }> = []
  let skipped = 0
  for (const it of allItems) {
    const p = it.product
    if (!p) {
      skipped++
      continue
    }
    if (p.in_stock === false || p.show_in_orders === false) {
      skipped++
      continue
    }
    valid.push({ product_id: it.product_id, qty: it.qty })
  }

  return NextResponse.json({
    ok: true,
    items: valid,
    skipped,
    source_order_number: lastOrder.order_number,
    has_history: true,
  })
}
