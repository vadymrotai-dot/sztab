// lib/orders/load-order-initial.ts — wspólny loader danych zamówienia (draft).
// Wyekstrahowany z GET /api/orders/[token], żeby portal klienta mógł wołać go
// BEZPOŚREDNIO (bez self-HTTP-fetch, który na Preview łapie SSO/redirect).
// Route API i portal używają DOKŁADNIE tej samej logiki + tego samego pricing.ts.

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeNewUnitPrice,
  resolveClientDiscount,
  markupForSupplier,
} from '@/lib/orders/pricing'
import { GLOBAL_FOOD_SUPPLIER_ID } from '@/lib/orders/discount-tiers'

const UUID_RE = /^[0-9a-f-]{36}$/i

export async function loadOrderInitial(
  token: string,
): Promise<{ status: number; body: any }> {
  if (!UUID_RE.test(token)) {
    return { status: 400, body: { ok: false, error: 'Niepoprawny token' } }
  }

  let supabase
  try {
    supabase = createAdminClient()
  } catch (e: any) {
    console.error('[load-order] admin client init failed:', e?.message)
    return { status: 500, body: { ok: false, error: 'Configuration error' } }
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select(
      'id, status, order_number, contact_person, contact_phone, contact_email, delivery_address, preferred_delivery_date, customer_notes, client_id, cohort_id, link_opened_at, submitted_at, cennik_tier, price_mode',
    )
    .eq('access_token', token)
    .maybeSingle()
  if (orderErr) {
    console.error('[load-order] DB query failed:', orderErr.message)
    return { status: 500, body: { ok: false, error: 'Błąd bazy danych' } }
  }
  if (!order) {
    return {
      status: 404,
      body: { ok: false, error: 'Zamówienie nie zostało znalezione' },
    }
  }

  if (order.status !== 'draft') {
    return {
      status: 409,
      body: {
        ok: false,
        error: 'Zamówienie zostało już złożone',
        order_number: order.order_number,
        status: order.status,
      },
    }
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, title, nip, city, address, region, email, phone, marketing_consent')
    .eq('id', order.client_id)
    .maybeSingle()

  const { data: savedPoints } = await supabase
    .from('client_delivery_points')
    .select(
      'id, nazwa, ulica, kod_pocztowy, miasto, typ_punktu, odbiorca_imie, odbiorca_telefon',
    )
    .eq('client_id', order.client_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select(
      'id, name, display_name, gramatura, price_maly_opt, price_sredni, price_duzy, price_duzi_gracze, price_hurt_wh, order_form_sort, category, grupa, podgrupa, in_stock, unit, vat_rate, marza_bazowa_pct, cost_pln, supplier_id, dostepnosc, stock_level, reserved_qty',
    )
    .eq('show_in_orders', true)
    .order('order_form_sort', { ascending: true })
  if (prodErr) {
    return { status: 500, body: { ok: false, error: 'Błąd pobierania cennika' } }
  }

  if (!order.link_opened_at) {
    await supabase
      .from('orders')
      .update({ link_opened_at: new Date().toISOString() })
      .eq('id', order.id)
  }

  const discounts = await resolveClientDiscount(supabase, order.client_id)

  return {
    status: 200,
    body: {
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
        cennik_tier: (order.cennik_tier === 'wielki_hurt'
          ? 'wielki_hurt'
          : 'standard') as 'standard' | 'wielki_hurt',
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
        grupa: p.grupa,
        podgrupa: p.podgrupa,
        in_stock: p.in_stock,
        dostepnosc: (p.dostepnosc === 'na_zamowienie'
          ? 'na_zamowienie'
          : 'w_magazynie') as 'w_magazynie' | 'na_zamowienie',
        unit: p.unit,
        available:
          p.stock_level == null
            ? null
            : Math.max(0, Number(p.stock_level) - Number(p.reserved_qty || 0)),
        sort: p.order_form_sort,
        vat_rate: p.vat_rate == null ? 0.05 : Number(p.vat_rate),
        new_unit_price: (() => {
          const ind =
            p.supplier_id === GLOBAL_FOOD_SUPPLIER_ID
              ? discounts.kalmar
              : discounts.ogolna
          const np = computeNewUnitPrice(
            { marza_bazowa_pct: p.marza_bazowa_pct, cost_pln: p.cost_pln },
            ind,
            markupForSupplier(p.supplier_id, discounts.restaurantMarkup),
          )
          return np != null && !Number.isNaN(np) ? np : null
        })(),
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
          hurt_wh: p.price_hurt_wh == null ? null : Number(p.price_hurt_wh),
        },
      })),
      individual_discount: discounts.ogolna,
      individual_discount_kalmar: discounts.kalmar,
      has_marketing_consent: client?.marketing_consent === true,
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
    },
  }
}
