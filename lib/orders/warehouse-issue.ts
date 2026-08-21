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
  findOrCreateFakturowniaClient,
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

// Клієнти Sztab для дропдауна WZ.
export async function getWarehouseClients() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('clients')
    .select('id, title, nip')
    .order('title')
  return (data ?? []).map((c: any) => ({ id: c.id, title: c.title, nip: c.nip }))
}

export type IssueInput = {
  clientId?: string | null // Sztab client uuid; порожньо → RW
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

  // Клієнт: з обраного Sztab-клієнта → його контрагент у Fakturownia (find-or-create по NIP).
  let clientId: number | undefined
  if (input.clientId) {
    const { data: c } = await admin
      .from('clients')
      .select('title, nip, fakturownia_client_id')
      .eq('id', input.clientId)
      .maybeSingle()
    if ((c as any)?.fakturownia_client_id) {
      clientId = Number((c as any).fakturownia_client_id)
    } else if (c) {
      clientId = await findOrCreateFakturowniaClient({
        name: (c as any).title || 'Klient',
        tax_no: (c as any).nip ?? null,
      })
      await admin
        .from('clients')
        .update({ fakturownia_client_id: clientId })
        .eq('id', input.clientId)
    }
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
