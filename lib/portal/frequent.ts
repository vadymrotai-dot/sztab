// lib/portal/frequent.ts — "Twoje częste zakupy" (Pulpit portalu klienta).
// Agregacja order_items po client_id (status<>draft), top-N po liczbie zamówień
// z danym produktem. Cena ŻYWA przez pricing.ts (ta sama zniżka co reorder),
// NIE ze snapshotu. Tylko produkty wciąż w ofercie (show_in_orders=true).

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeNewUnitPrice,
  resolveClientDiscount,
  markupForSupplier,
} from '@/lib/orders/pricing'
import { GLOBAL_FOOD_SUPPLIER_ID } from '@/lib/orders/discount-tiers'

export type FrequentProduct = {
  id: string
  name: string
  gramatura: string | null
  unit: string | null
  price: number | null // zł/unit, żywa (zniżka klienta); null → brak wyceny
}

export async function getFrequentProducts(
  clientId: string,
  limit = 8,
): Promise<FrequentProduct[]> {
  const admin = createAdminClient()

  // 1) Zamówienia klienta (nie draft) → id.
  const { data: orders } = await admin
    .from('orders')
    .select('id')
    .eq('client_id', clientId)
    .neq('status', 'draft')
  const orderIds = (orders ?? []).map((o) => o.id as string)
  if (orderIds.length === 0) return []

  // 2) Pozycje tych zamówień → agregacja po product_id (liczba zamówień + suma qty).
  const { data: items } = await admin
    .from('order_items')
    .select('order_id, product_id, qty')
    .in('order_id', orderIds)
    .not('product_id', 'is', null)

  const agg = new Map<string, { orders: Set<string>; qty: number }>()
  for (const it of (items ?? []) as Array<{
    order_id: string
    product_id: string
    qty: number | string
  }>) {
    const cur = agg.get(it.product_id) ?? { orders: new Set(), qty: 0 }
    cur.orders.add(it.order_id)
    cur.qty += Number(it.qty) || 0
    agg.set(it.product_id, cur)
  }
  if (agg.size === 0) return []

  const ranked = [...agg.entries()]
    .sort((a, b) => b[1].orders.size - a[1].orders.size || b[1].qty - a[1].qty)
    .map(([pid]) => pid)

  // 3) Produkty wciąż w ofercie (show_in_orders=true) + kolumny do wyceny.
  const { data: products } = await admin
    .from('products')
    .select(
      'id, name, display_name, gramatura, unit, price_maly_opt, marza_bazowa_pct, cost_pln, supplier_id, show_in_orders',
    )
    .in('id', ranked)
    .eq('show_in_orders', true)

  const byId = new Map(
    ((products ?? []) as Array<Record<string, unknown>>).map((p) => [
      p.id as string,
      p,
    ]),
  )

  // 4) Żywa cena (mirror loadOrderInitial): new_unit_price ?? price_maly_opt.
  const discounts = await resolveClientDiscount(admin, clientId)
  const out: FrequentProduct[] = []
  for (const pid of ranked) {
    const p = byId.get(pid)
    if (!p) continue // zdjęte z oferty → pomijamy
    const ind =
      p.supplier_id === GLOBAL_FOOD_SUPPLIER_ID
        ? discounts.kalmar
        : discounts.ogolna
    const np = computeNewUnitPrice(
      {
        marza_bazowa_pct: p.marza_bazowa_pct as number | string | null,
        cost_pln: p.cost_pln as number | string | null,
      },
      ind,
      markupForSupplier(p.supplier_id as string | null, discounts.restaurantMarkup),
    )
    const price =
      np != null && !Number.isNaN(np)
        ? np
        : p.price_maly_opt != null
          ? Number(p.price_maly_opt)
          : null
    out.push({
      id: pid,
      name: (p.display_name as string) || (p.name as string),
      gramatura: (p.gramatura as string) ?? null,
      unit: (p.unit as string) ?? null,
      price,
    })
    if (out.length >= limit) break
  }
  return out
}
