/**
 * Fakturownia warehouse sync — Ф1 (magazyny).
 *
 * - syncProductsToFakturownia: push усіх show_in_orders товарів як складські
 *   записи Fakturownia (limited:1). code = Sztab product id (стабільний ключ).
 *   Зберігає products.fakturownia_product_id. Ідемпотентно (update якщо id є).
 * - syncStockFromFakturownia: читає stock_level зі складу → products.stock_level
 *   + stock_synced_at. Матч по code (= Sztab id).
 *
 * Продавець/залишок веде Fakturownia; Sztab тримає кеш для показу й блокування.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  createFakturowniaProduct,
  updateFakturowniaProduct,
  getWarehouseStock,
  WAREHOUSE_ID,
  type FakturowniaProductInput,
} from '@/lib/integrations/fakturownia'

export type SyncProductsResult = {
  total: number
  created: number
  updated: number
  failed: number
  errors: string[]
}

export async function syncProductsToFakturownia(): Promise<SyncProductsResult> {
  const admin = createAdminClient()
  const { data: products, error } = await admin
    .from('products')
    .select(
      'id, name, display_name, ean, unit, vat_rate, cost_pln, marza_bazowa_pct, fakturownia_product_id',
    )
    .eq('show_in_orders', true)

  if (error) throw new Error(`DB load products: ${error.message}`)

  const res: SyncProductsResult = {
    total: products?.length ?? 0,
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  }

  for (const p of (products ?? []) as any[]) {
    try {
      const taxPct = p.vat_rate == null ? 5 : Math.round(Number(p.vat_rate) * 100)
      const cost = p.cost_pln != null ? Number(p.cost_pln) : null
      const marza = p.marza_bazowa_pct != null ? Number(p.marza_bazowa_pct) : null
      const priceNet =
        cost != null && marza != null && marza < 1
          ? Math.round((cost / (1 - marza)) * 100) / 100
          : null

      const input: FakturowniaProductInput = {
        code: String(p.id),
        name: String(p.display_name || p.name),
        ean_code: p.ean ?? null,
        tax: taxPct,
        unit: (p.unit as string) || 'szt',
        purchase_price_net: cost,
        price_net: priceNet,
      }

      if (p.fakturownia_product_id) {
        await updateFakturowniaProduct(Number(p.fakturownia_product_id), input)
        res.updated++
      } else {
        const fid = await createFakturowniaProduct(input)
        const { error: upErr } = await admin
          .from('products')
          .update({ fakturownia_product_id: fid })
          .eq('id', p.id)
        if (upErr) throw new Error(`store id: ${upErr.message}`)
        res.created++
      }
    } catch (e: any) {
      res.failed++
      res.errors.push(`${p.name}: ${e?.message ?? e}`.slice(0, 200))
    }
  }

  return res
}

export type SyncStockResult = {
  warehouse: string
  matched: number
  updated: number
  skipped: number
}

export async function syncStockFromFakturownia(): Promise<SyncStockResult> {
  if (!WAREHOUSE_ID) throw new Error('FAKTUROWNIA_WAREHOUSE_ID не задано')
  const admin = createAdminClient()
  const stockByCode = await getWarehouseStock(WAREHOUSE_ID)

  const now = new Date().toISOString()
  let updated = 0
  let skipped = 0

  for (const [code, level] of stockByCode) {
    // code = Sztab product id (UUID). Оновлюємо кеш залишку.
    const { error } = await admin
      .from('products')
      .update({ stock_level: level, stock_synced_at: now })
      .eq('id', code)
    if (error) skipped++
    else updated++
  }

  return {
    warehouse: String(WAREHOUSE_ID),
    matched: stockByCode.size,
    updated,
    skipped,
  }
}
