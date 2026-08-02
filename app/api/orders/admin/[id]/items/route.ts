// app/api/orders/admin/[id]/items/route.ts
// Sprint S-ORDER.1.C.3 (19.05.2026) — order_items CRUD для admin edit mode.
//
// POST   /api/orders/admin/[id]/items  — add new line { product_id, qty }
// PATCH  /api/orders/admin/[id]/items  — update qty { item_id, qty }
// DELETE /api/orders/admin/[id]/items  — remove line { item_id }
//
// Кожна операція recompute orders.total_net/vat/brutto та bump updated_at.
// Editable status whitelist: submitted, confirmed, in_realization.
// Unit price computed від order.tier_at_submit — клієнт бачив цю ціну.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeNewUnitPrice, resolveClientDiscount } from '@/lib/orders/pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

// Sprint S-CENNIK-WH.1 (26.05.2026) — wielki_hurt 4-й tier (locked).
// Sprint S-CENNIK-WH.2 (26.05.2026) — wielki_hurt_entry 5-й tier (Hurt entry < 10k).
type Tier =
  | 'maly'
  | 'sredni'
  | 'duzy'
  | 'wielki_hurt'
  | 'wielki_hurt_entry'
const TIER_PRICE: Record<
  Tier,
  'price_maly_opt' | 'price_sredni' | 'price_duzy' | 'price_duzi_gracze' | 'price_hurt_wh'
> = {
  maly: 'price_maly_opt',
  sredni: 'price_sredni',
  duzy: 'price_duzy',
  wielki_hurt: 'price_duzi_gracze',
  wielki_hurt_entry: 'price_hurt_wh',
}

const EDITABLE_STATUSES = ['submitted', 'confirmed', 'in_realization']

type RouteContext = { params: Promise<{ id: string }> }

async function recomputeOrderTotals(admin: any, orderId: string) {
  const { data: items } = await admin
    .from('order_items')
    .select('line_total')
    .eq('order_id', orderId)
  const totalNet = (items || []).reduce(
    (s: number, i: any) => s + Number(i.line_total),
    0,
  )
  const totalVat = Math.round(totalNet * 0.05 * 100) / 100
  const totalBrutto = Math.round((totalNet + totalVat) * 100) / 100
  await admin
    .from('orders')
    .update({
      total_net: totalNet.toFixed(2),
      total_vat: totalVat.toFixed(2),
      total_brutto: totalBrutto.toFixed(2),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
  return { total_net: totalNet, total_vat: totalVat, total_brutto: totalBrutto }
}

async function authCheck(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return !!user
}

// ── POST ──────────────────────────────────────────────────────────────────
const PostSchema = z.object({
  product_id: z.string().regex(UUID_RE),
  qty: z.number().int().min(1).max(9999),
})

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawne ID' },
      { status: 400 },
    )
  }
  if (!(await authCheck())) {
    return NextResponse.json(
      { ok: false, error: 'Nieautoryzowany' },
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny format' },
      { status: 400 },
    )
  }
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Walidacja',
        details: parsed.error.flatten(),
      },
      { status: 422 },
    )
  }

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('id, status, tier_at_submit, client_id')
    .eq('id', id)
    .maybeSingle()
  if (!order) {
    return NextResponse.json(
      { ok: false, error: 'Zamówienie nie znalezione' },
      { status: 404 },
    )
  }
  if (!EDITABLE_STATUSES.includes(order.status)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Zamówienie nie może być edytowane (status: ${order.status})`,
      },
      { status: 409 },
    )
  }

  // Sprint S-CENNIK-WH.2 — accept 5 values (matrix 2x2 outputs)
  const rawTier = (order.tier_at_submit || 'maly') as string
  const validTiers: Tier[] = ['maly', 'sredni', 'duzy', 'wielki_hurt', 'wielki_hurt_entry']
  const tier: Tier = (validTiers as readonly string[]).includes(rawTier)
    ? (rawTier as Tier)
    : 'maly'
  const priceKey = TIER_PRICE[tier]

  const { data: product } = await admin
    .from('products')
    .select(`id, name, display_name, gramatura, ${priceKey}, marza_bazowa_pct, cost_pln, show_in_orders`)
    .eq('id', parsed.data.product_id)
    .eq('show_in_orders', true)
    .maybeSingle()
  if (!product) {
    return NextResponse.json(
      { ok: false, error: 'Produkt niedostępny' },
      { status: 400 },
    )
  }

  // Task #14 — new-price-path (marża bazowa) ma pierwszeństwo, spójnie z submit/GET.
  // Fallback na starą matrycę (tier_at_submit) tylko gdy marża NULL.
  const discount = await resolveClientDiscount(admin, (order as any).client_id ?? null)
  const np = computeNewUnitPrice(product as any, discount)
  let unitPrice: number
  if (np != null && !Number.isNaN(np)) {
    unitPrice = np
  } else {
    // Sprint S-CENNIK-WH.2 — guard against NULL price (np. wielki_hurt_entry SKU bez price_hurt_wh)
    const rawPrice = (product as any)[priceKey]
    if (rawPrice == null) {
      return NextResponse.json(
        { ok: false, error: `Produkt nie ma ceny w cenniku (${priceKey}) — admin override required` },
        { status: 400 },
      )
    }
    unitPrice = Number(rawPrice)
  }
  const lineTotal = parsed.data.qty * unitPrice

  const { data: inserted, error: insErr } = await admin
    .from('order_items')
    .insert({
      order_id: id,
      product_id: parsed.data.product_id,
      product_name_snapshot: (product as any).display_name || (product as any).name,
      gramatura_snapshot: (product as any).gramatura,
      qty: parsed.data.qty,
      unit_price: unitPrice.toFixed(2),
      line_total: lineTotal.toFixed(2),
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    console.error('[orders][items][POST] insert failed:', insErr?.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd dodawania pozycji' },
      { status: 500 },
    )
  }

  const totals = await recomputeOrderTotals(admin, id)
  return NextResponse.json({ ok: true, item_id: inserted.id, totals })
}

// ── PATCH ─────────────────────────────────────────────────────────────────
const PatchSchema = z.object({
  item_id: z.string().regex(UUID_RE),
  qty: z.number().int().min(1).max(9999),
})

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawne ID' },
      { status: 400 },
    )
  }
  if (!(await authCheck())) {
    return NextResponse.json(
      { ok: false, error: 'Nieautoryzowany' },
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny format' },
      { status: 400 },
    )
  }
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Walidacja',
        details: parsed.error.flatten(),
      },
      { status: 422 },
    )
  }

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('status')
    .eq('id', id)
    .maybeSingle()
  if (!order || !EDITABLE_STATUSES.includes(order.status)) {
    return NextResponse.json(
      { ok: false, error: 'Zamówienie nie może być edytowane' },
      { status: 409 },
    )
  }

  const { data: item } = await admin
    .from('order_items')
    .select('id, order_id, unit_price')
    .eq('id', parsed.data.item_id)
    .maybeSingle()
  if (!item || item.order_id !== id) {
    return NextResponse.json(
      { ok: false, error: 'Pozycja nie znaleziona' },
      { status: 404 },
    )
  }

  const newLineTotal = parsed.data.qty * Number(item.unit_price)

  const { error: updErr } = await admin
    .from('order_items')
    .update({
      qty: parsed.data.qty,
      line_total: newLineTotal.toFixed(2),
    })
    .eq('id', parsed.data.item_id)

  if (updErr) {
    console.error('[orders][items][PATCH] update failed:', updErr.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd aktualizacji' },
      { status: 500 },
    )
  }

  const totals = await recomputeOrderTotals(admin, id)
  return NextResponse.json({ ok: true, line_total: newLineTotal, totals })
}

// ── DELETE ────────────────────────────────────────────────────────────────
const DeleteSchema = z.object({
  item_id: z.string().regex(UUID_RE),
})

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawne ID' },
      { status: 400 },
    )
  }
  if (!(await authCheck())) {
    return NextResponse.json(
      { ok: false, error: 'Nieautoryzowany' },
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny format' },
      { status: 400 },
    )
  }
  const parsed = DeleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Walidacja' },
      { status: 422 },
    )
  }

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('status')
    .eq('id', id)
    .maybeSingle()
  if (!order || !EDITABLE_STATUSES.includes(order.status)) {
    return NextResponse.json(
      { ok: false, error: 'Zamówienie nie może być edytowane' },
      { status: 409 },
    )
  }

  const { data: items } = await admin
    .from('order_items')
    .select('id')
    .eq('order_id', id)
  const itemsList = items || []
  if (!itemsList.find((i: any) => i.id === parsed.data.item_id)) {
    return NextResponse.json(
      { ok: false, error: 'Pozycja nie znaleziona' },
      { status: 404 },
    )
  }
  if (itemsList.length <= 1) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Nie można usunąć ostatniej pozycji — anuluj zamówienie zamiast tego',
      },
      { status: 400 },
    )
  }

  const { error: delErr } = await admin
    .from('order_items')
    .delete()
    .eq('id', parsed.data.item_id)
  if (delErr) {
    console.error('[orders][items][DELETE] failed:', delErr.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd usuwania' },
      { status: 500 },
    )
  }

  const totals = await recomputeOrderTotals(admin, id)
  return NextResponse.json({ ok: true, totals })
}
