/**
 * Генерація динамічної оферти під клієнта (xlsx) — з поточними цінами саме
 * цього клієнта (його знижки + роздрібна позначка). PL/UA.
 *
 * Ціна = computeNewUnitPrice(product, znizka, markupForSupplier) — та сама
 * логіка, що й у замовярці, тож оферта == ціни у формі.
 */

import 'server-only'

import * as XLSX from 'xlsx'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeNewUnitPrice,
  resolveClientDiscount,
  markupForSupplier,
} from '@/lib/orders/pricing'
import { GLOBAL_FOOD_SUPPLIER_ID } from '@/lib/orders/discount-tiers'

const L = {
  pl: { sheet: 'Oferta', product: 'Produkt', gram: 'Gramatura', unit: 'j.m.', price: 'Cena netto zł' },
  ua: { sheet: 'Оферта', product: 'Товар', gram: 'Фасування', unit: 'од.', price: 'Ціна нетто zł' },
} as const

export async function buildClientOfferXlsx(
  clientId: string,
  lang: 'pl' | 'ua',
): Promise<{ buffer: Buffer; filename: string }> {
  const admin = createAdminClient()
  const discounts = await resolveClientDiscount(admin, clientId)

  const { data: suppliers } = await admin.from('suppliers').select('id, name')
  const supName = new Map((suppliers ?? []).map((s: any) => [s.id, s.name]))

  const { data: products } = await admin
    .from('products')
    .select(
      'id, name, display_name, gramatura, unit, supplier_id, marza_bazowa_pct, cost_pln, vat_rate, order_form_sort',
    )
    .eq('show_in_orders', true)
    .order('supplier_id', { ascending: true })
    .order('order_form_sort', { ascending: true })

  const t = L[lang]
  const rows: (string | number)[][] = []
  rows.push([lang === 'ua' ? 'Оферта DAGOLD' : 'Oferta DAGOLD'])
  rows.push([])

  let currentSup: string | null = null
  for (const p of (products ?? []) as any[]) {
    const ind = p.supplier_id === GLOBAL_FOOD_SUPPLIER_ID ? discounts.kalmar : discounts.ogolna
    const price = computeNewUnitPrice(
      { marza_bazowa_pct: p.marza_bazowa_pct, cost_pln: p.cost_pln },
      ind,
      markupForSupplier(p.supplier_id, discounts.restaurantMarkup),
    )
    if (price == null || Number.isNaN(price)) continue

    if (p.supplier_id !== currentSup) {
      currentSup = p.supplier_id
      rows.push([])
      rows.push([`▼ ${supName.get(p.supplier_id) ?? '—'}`])
      rows.push([t.product, t.gram, t.unit, t.price])
    }
    rows.push([p.display_name || p.name, p.gramatura || '', p.unit || 'szt', price])
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 46 }, { wch: 16 }, { wch: 8 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws, t.sheet)

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return { buffer, filename: `DAGOLD_oferta_${lang.toUpperCase()}.xlsx` }
}
