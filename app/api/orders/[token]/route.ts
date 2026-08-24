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
import {
  computeNewUnitPrice,
  resolveClientDiscount,
  markupForSupplier,
} from '@/lib/orders/pricing'
import { GLOBAL_FOOD_SUPPLIER_ID } from '@/lib/orders/discount-tiers'

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
    .select('id, title, nip, city, address, region, email, phone, marketing_consent')
    .eq('id', order.client_id)
    .maybeSingle()

  // Przejście 1B — zapisane punkty dostawy klienta (profil) do pickera w formie.
  // Publiczny loader (service-role) — forma nie ma client_id ani sesji, więc
  // punkty muszą przyjść tutaj zamiast z admin-route /api/clients/[id]/...
  const { data: savedPoints } = await supabase
    .from('client_delivery_points')
    .select(
      'id, nazwa, ulica, kod_pocztowy, miasto, typ_punktu, odbiorca_imie, odbiorca_telefon',
    )
    .eq('client_id', order.client_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  // Load 17 SKU available для orders
  // Sprint S-CENNIK-WH.1 — also fetch price_duzi_gracze для wielki_hurt tier.
  // Sprint S-CENNIK-WH.2 — also fetch price_hurt_wh для wielki_hurt + auto matrix cell.
  const { data: products, error: prodErr } = await supabase
    .from('products')
    // Sprint T-ORDER.4a-UI (30.05.2026) — dodano grupa, podgrupa, in_stock, unit
    // dla 2-poziomowego akordeonu w formie + display jednostki + wygaszania
    // produktów niedostępnych (in_stock=false).
    .select(
      // Przejście 2C — dodano vat_rate (front liczy VAT per-stawka jak serwer 2A).
      // Task #14 — dodano marza_bazowa_pct + cost_pln dla new-price-path (parity z submit).
      'id, name, display_name, gramatura, price_maly_opt, price_sredni, price_duzy, price_duzi_gracze, price_hurt_wh, order_form_sort, category, grupa, podgrupa, in_stock, unit, vat_rate, marza_bazowa_pct, cost_pln, supplier_id, dostepnosc, stock_level, reserved_qty',
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

  // Task #14 — zniżka klienta (ta sama funkcja co submit) do policzenia
  // new_unit_price per produkt. Klient widzi TĘ SAMĄ cenę co potem submit.
  const discounts = await resolveClientDiscount(supabase, order.client_id)

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
      // Sprint T-ORDER.4a-UI — nowe pola dla 2-poziomowej hierarchii + wygaszania
      grupa: p.grupa,
      podgrupa: p.podgrupa,
      in_stock: p.in_stock,
      // Faza 1 DAGOLD — oś dostępności (display-only, badge w order-form).
      dostepnosc: (p.dostepnosc === 'na_zamowienie' ? 'na_zamowienie' : 'w_magazynie') as
        | 'w_magazynie'
        | 'na_zamowienie',
      unit: p.unit,
      // Ф1 magazyn — dostępna ilość = stock_level − reserved_qty.
      // null → produkt nie jest zarządzany magazynowo (brak limitu, jak dotychczas).
      available:
        p.stock_level == null
          ? null
          : Math.max(0, Number(p.stock_level) - Number(p.reserved_qty || 0)),
      sort: p.order_form_sort,
      // Przejście 2C — vat_rate per produkt (CM 0.05, kalmary 0.23, putasu 0.05).
      vat_rate: p.vat_rate == null ? 0.05 : Number(p.vat_rate),
      // Task #14 — new-price-path (marża bazowa). Gdy != null, order-form pokazuje
      // TĘ cenę (stałą), a nie starą matrycę → parity z submit. NaN (marża bez
      // kosztu) → null (fallback na matrycę, jak w submit guard).
      new_unit_price: (() => {
        const ind =
          p.supplier_id === GLOBAL_FOOD_SUPPLIER_ID ? discounts.kalmar : discounts.ogolna
        const np = computeNewUnitPrice(
          { marza_bazowa_pct: p.marza_bazowa_pct, cost_pln: p.cost_pln },
          ind,
          markupForSupplier(p.supplier_id, discounts.restaurantMarkup),
        )
        return np != null && !Number.isNaN(np) ? np : null
      })(),
      // Krok 3 DAGOLD — rabaty wolumenowe per grupa. Front liczy je live z
      // base_unit_price (cena A BEZ rabatu) + supplier_id (klucz grupy).
      supplier_id: p.supplier_id,
      base_unit_price: (() => {
        const b = computeNewUnitPrice(
          { marza_bazowa_pct: p.marza_bazowa_pct, cost_pln: p.cost_pln },
          0,
          markupForSupplier(p.supplier_id, discounts.restaurantMarkup),
        )
        return b != null && !Number.isNaN(b) ? b : null
      })(),
      prices: {
        maly: Number(p.price_maly_opt),
        sredni: Number(p.price_sredni),
        duzy: Number(p.price_duzy),
        wielki_hurt: Number(p.price_duzi_gracze),
        // Sprint S-CENNIK-WH.2 — Hurt entry-tier (NULL → 0 fallback, але UI sprawdza)
        hurt_wh: p.price_hurt_wh == null ? null : Number(p.price_hurt_wh),
      },
    })),
    // Krok DAGOLD — rozdzielony rabat indywidualny: ogólny (ЧМ/ryby/reszta) i
    // osobny na kalmary/przekąski. Front i submit stosują wg grupy produktu.
    individual_discount: discounts.ogolna,
    individual_discount_kalmar: discounts.kalmar,
    // Poprawki 1B — czy klient ma już zgodę marketingową (UI ukrywa galochkę).
    has_marketing_consent: client?.marketing_consent === true,
    // Przejście 1B — zapisane punkty dostawy klienta (dla akcji "Nowe zamówienie").
    saved_delivery_points: (savedPoints || []).map((sp) => ({
      id: sp.id,
      nazwa: sp.nazwa,
      ulica: sp.ulica,
      kod_pocztowy: sp.kod_pocztowy,
      miasto: sp.miasto,
      typ_punktu: sp.typ_punktu,
      odbiorca_imie: sp.odbiorca_imie,
      odbiorca_telefon: sp.odbiorca_telefon,
    })),
  })
}
