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
  // Faza 1 portal — opcjonalny order_id: reorder KONKRETNEGO zamówienia z historii
  // (zamiast ostatniego). Scoped do client_id bieżącego order (izolacja).
  const reorderId = _req.nextUrl.searchParams.get('order_id')
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
  // Przejście 1A — also fetch delivery_mode/documents_mode + legacy adres/data,
  // żeby "Powtórz" odtwarzał całość dostawy, nie tylko produkty.
  const lastCols =
    'id, order_number, submitted_at, delivery_mode, documents_mode, delivery_address, preferred_delivery_date'
  // Portal reorder: konkretne zamówienie (scoped do client_id) albo ostatnie submitted.
  const lastQuery =
    reorderId && UUID_RE.test(reorderId)
      ? admin
          .from('orders')
          .select(lastCols)
          .eq('id', reorderId)
          .eq('client_id', currentOrder.client_id) // izolacja — cudze nie przejdzie
          .maybeSingle()
      : admin
          .from('orders')
          .select(lastCols)
          .eq('client_id', currentOrder.client_id)
          .not('submitted_at', 'is', null)
          .neq('status', 'cancelled')
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle()
  const { data: lastOrder, error: lastErr } = await lastQuery
  if (lastErr) {
    console.error('[orders][token][last] last order query failed:', lastErr.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd bazy danych' },
      { status: 500 },
    )
  }
  if (!lastOrder) {
    return NextResponse.json({
      ok: true,
      items: [],
      skipped: 0,
      source_order_number: null,
      has_history: false,
      delivery_mode: 'jeden',
      documents_mode: 'wspolna',
      delivery_address: null,
      preferred_delivery_date: null,
      delivery_points: [],
    })
  }

  // 3. SELECT items + JOIN products dla filter in_stock + show_in_orders.
  // Przejście 1A — dodano delivery_point_id dla mapowania pozycja → punkt.
  const { data: items, error: itemsErr } = await admin
    .from('order_items')
    .select(
      'product_id, qty, delivery_point_id, product:products!inner(id, in_stock, show_in_orders)',
    )
    .eq('order_id', lastOrder.id)
  if (itemsErr) {
    console.error('[orders][token][last] items query failed:', itemsErr.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd bazy danych' },
      { status: 500 },
    )
  }

  // 3b. Przejście 1A — SELECT order_delivery_points (kształt jak payload submit).
  // Kolejność stabilna (created_at) → indeks = delivery_point_index dla repeat.
  const { data: rawPoints, error: pointsErr } = await admin
    .from('order_delivery_points')
    .select(
      'id, label, ulica, kod_pocztowy, miasto, typ, termin_typ, preferred_date, odbiorca_imie, odbiorca_telefon',
    )
    .eq('order_id', lastOrder.id)
    .order('created_at', { ascending: true })
  if (pointsErr) {
    console.error('[orders][token][last] delivery_points query failed:', pointsErr.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd bazy danych' },
      { status: 500 },
    )
  }
  const points = (rawPoints ?? []) as Array<{
    id: string
    label: string | null
    ulica: string | null
    kod_pocztowy: string | null
    miasto: string | null
    typ: string | null
    termin_typ: string | null
    preferred_date: string | null
    odbiorca_imie: string | null
    odbiorca_telefon: string | null
  }>
  // Mapa point_id → index (dla pozycji), oraz payload-shape delivery_points.
  const pointIndexById = new Map<string, number>()
  points.forEach((p, idx) => pointIndexById.set(p.id, idx))
  const deliveryPoints = points.map((p) => ({
    label: p.label,
    ulica: p.ulica,
    kod_pocztowy: p.kod_pocztowy,
    miasto: p.miasto,
    typ: p.typ ?? 'dostawa',
    termin_typ: p.termin_typ ?? 'najblizszy',
    preferred_date: p.preferred_date,
    odbiorca_imie: p.odbiorca_imie,
    odbiorca_telefon: p.odbiorca_telefon,
  }))

  // 4. Filter — pomija jeśli product not found, !in_stock lub !show_in_orders.
  // Przejście 1A — zachowaj delivery_point_index dla odtworzenia przypisania.
  type ItemRow = {
    product_id: string
    qty: number
    delivery_point_id: string | null
    product: { id: string; in_stock: boolean | null; show_in_orders: boolean | null } | null
  }
  const allItems = (items ?? []) as unknown as ItemRow[]
  const valid: Array<{ product_id: string; qty: number; delivery_point_index: number | null }> = []
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
    const dpIdx =
      it.delivery_point_id != null && pointIndexById.has(it.delivery_point_id)
        ? pointIndexById.get(it.delivery_point_id)!
        : null
    valid.push({ product_id: it.product_id, qty: it.qty, delivery_point_index: dpIdx })
  }

  return NextResponse.json({
    ok: true,
    items: valid,
    skipped,
    source_order_number: lastOrder.order_number,
    has_history: true,
    // Przejście 1A — pełna dostawa do odtworzenia przez "Powtórz".
    delivery_mode: lastOrder.delivery_mode ?? 'jeden',
    documents_mode: lastOrder.documents_mode ?? 'wspolna',
    delivery_address: lastOrder.delivery_address ?? null,
    preferred_delivery_date: lastOrder.preferred_delivery_date ?? null,
    delivery_points: deliveryPoints,
  })
}
