/**
 * Ręczne wydanie magazynowe (WZ / RW) — Ф2.
 *
 * Оператор вручну списує залишок: WZ (для клієнта) або RW (внутрішня корекція,
 * якщо клієнта не вказано). Використовується для «дозавантажувальних» продажів
 * (фактура вже є, але WZ не було) та інвентаризаційних корекцій.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  createWarehouseWZ,
  createFakturowniaClient,
  WAREHOUSE_ID,
} from '@/lib/integrations/fakturownia'

export async function getWarehouseManagedProducts() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('products')
    .select('id, name, display_name, unit, stock_level, fakturownia_product_id')
    .not('fakturownia_product_id', 'is', null)
    .order('name')
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.display_name || p.name,
    unit: p.unit,
    stock_level: p.stock_level,
  }))
}

export type IssueInput = {
  clientName?: string | null
  clientNip?: string | null
  issueDate?: string | null
  description?: string | null
  lines: { product_id: string; qty: number; price_net?: number | null }[]
}

export async function createManualIssue(input: IssueInput): Promise<{
  id: number
  number: string
  kind: string
  updated: number
  errors: string[]
}> {
  if (!WAREHOUSE_ID) throw new Error('FAKTUROWNIA_WAREHOUSE_ID не задано')
  const admin = createAdminClient()
  const errors: string[] = []

  const ids = input.lines.map((l) => l.product_id)
  const { data: prods } = await admin
    .from('products')
    .select('id, name, display_name, fakturownia_product_id, stock_level')
    .in('id', ids)
  const byId = new Map((prods ?? []).map((p: any) => [p.id, p]))

  const wzLines: {
    product_id: number
    quantity: number
    price_net?: number | null
    _sztab_id: string
  }[] = []
  for (const l of input.lines) {
    if (!(l.qty > 0)) continue
    const p = byId.get(l.product_id)
    if (!p?.fakturownia_product_id) {
      errors.push(`${p?.name ?? l.product_id}: brak w magazynie Fakturownia`)
      continue
    }
    wzLines.push({
      product_id: Number(p.fakturownia_product_id),
      quantity: l.qty,
      price_net: l.price_net ?? null,
      _sztab_id: l.product_id,
    })
  }
  if (wzLines.length === 0) throw new Error('Brak pozycji do wydania')

  let clientId: number | undefined
  if (input.clientName && input.clientName.trim()) {
    clientId = await createFakturowniaClient({
      name: input.clientName.trim(),
      tax_no: input.clientNip ?? null,
    })
  }

  const doc = await createWarehouseWZ({
    warehouseId: WAREHOUSE_ID,
    clientId,
    issueDate: input.issueDate ?? undefined,
    description: input.description ?? undefined,
    lines: wzLines.map(({ _sztab_id, ...rest }) => rest),
  })

  let updated = 0
  for (const l of wzLines) {
    const p = byId.get(l._sztab_id)
    if (p?.stock_level == null) continue
    const next = Math.max(0, Number(p.stock_level) - Number(l.quantity))
    const { error } = await admin
      .from('products')
      .update({ stock_level: next, stock_synced_at: new Date().toISOString() })
      .eq('id', l._sztab_id)
    if (!error) updated++
  }

  return { ...doc, updated, errors }
}
