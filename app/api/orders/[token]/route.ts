// app/api/orders/[token]/route.ts
// Sprint S-ORDER.1.B.1 (19.05.2026) — public order draft loader.
//
// GET /api/orders/[token]
//   - Validates UUID token
//   - Loads order draft via access_token (service-role bypasses RLS)
//   - 404 якщо not found
//   - 409 якщо already submitted
//   - Pre-fills client data + 17 SKU cennika
//   - Marks link_opened_at on first open
//
// NO auth check у layout — public route. Authorization via access_token UUID
// у URL (random, single-use-per-draft, revocable per row).

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

  let supabase
  try {
    supabase = createAdminClient()
  } catch (e: any) {
    console.error('[orders][token] admin client init failed:', e?.message)
    return NextResponse.json(
      { ok: false, error: 'Configuration error' },
      { status: 500 },
    )
  }

  // Load order draft by access_token
  // Sprint S-CENNIK-WH.1 — also fetch cennik_tier (locked at offer-send).
  // Sprint S-CENNIK-WH.2 — also fetch price_mode (matrix 2x2).
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select(
      'id, status, order_number, contact_person, contact_phone, contact_email, delivery_address, preferred_delivery_date, customer_notes, client_id, cohort_id, link_opened_at, submitted_at, cennik_tier, price_mode',
    )
    .eq('access_token', token)
    .maybeSingle()
  if (orderErr) {
    console.error('[orders][token][GET] DB query failed:', orderErr.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd bazy danych' },
      { status: 500 },
    )
  }
  if (!order) {
    return NextResponse.json(
      { ok: false, error: 'Zamówienie nie zostało znalezione' },
      { status: 404 },
    )
  }

  // Block re-submission via public link
  if (order.status !== 'draft') {
    return NextResponse.json(
      {
        ok: false,
        error: 'Zamówienie zostało już złożone',
        order_number: order.order_number,
        status: order.status,
      },
      { status: 409 },
    )
  }

  // Load client info (pre-fill data)
  const { data: client } = await supabase
    .from('clients')
    .select('id, title, nip, city, address, region, email, phone')
    .eq('id', order.client_id)
    .maybeSingle()

  // Load 17 SKU available для orders
  // Sprint S-CENNIK-WH.1 — also fetch price_duzi_gracze для wielki_hurt tier.
  // Sprint S-CENNIK-WH.2 — also fetch price_hurt_wh для wielki_hurt + auto matrix cell.
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select(
      'id, name, display_name, gramatura, price_maly_opt, price_sredni, price_duzy, price_duzi_gracze, price_hurt_wh, order_form_sort, category',
    )
    .eq('show_in_orders', true)
    .order('order_form_sort', { ascending: true })
  if (prodErr) {
    return NextResponse.json(
      { ok: false, error: 'Błąd pobierania cennika' },
      { status: 500 },
    )
  }

  // Mark link as opened (first time only — idempotent on subsequent loads)
  if (!order.link_opened_at) {
    await supabase
      .from('orders')
      .update({ link_opened_at: new Date().toISOString() })
      .eq('id', order.id)
  }

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      order_number: order.order_number,
      contact_person: order.contact_person,
      contact_phone: order.contact_phone,
      contact_email: order.contact_email,
      delivery_address: order.delivery_address,
      preferred_delivery_date: order.preferred_delivery_date,
      customer_notes: order.customer_notes,
      // Sprint S-CENNIK-WH.1 — expose tier для UI branching
      cennik_tier: (order.cennik_tier === 'wielki_hurt' ? 'wielki_hurt' : 'standard') as
        | 'standard'
        | 'wielki_hurt',
      // Sprint S-CENNIK-WH.2 — expose price_mode для UI branching (matrix 2x2)
      price_mode: (order.price_mode === 'minimum' ? 'minimum' : 'auto') as
        | 'auto'
        | 'minimum',
    },
    client: client
      ? {
          title: client.title,
          nip: client.nip,
          city: client.city || '',
          address: client.address || '',
          email: client.email || '',
          phone: client.phone || '',
        }
      : null,
    products: (products || []).map((p) => ({
      id: p.id,
      name: p.display_name || p.name,
      gramatura: p.gramatura,
      category: p.category,
      sort: p.order_form_sort,
      prices: {
        maly: Number(p.price_maly_opt),
        sredni: Number(p.price_sredni),
        duzy: Number(p.price_duzy),
        wielki_hurt: Number(p.price_duzi_gracze),
        // Sprint S-CENNIK-WH.2 — Hurt entry-tier (NULL → 0 fallback, але UI sprawdza)
        hurt_wh: p.price_hurt_wh == null ? null : Number(p.price_hurt_wh),
      },
    })),
  })
}
