// app/api/orders/[token]/submit/route.ts
// Sprint S-ORDER.1.B.1 (19.05.2026) — public order submit endpoint.
//
// POST /api/orders/[token]/submit
//   - Validates UUID token + Zod body
//   - Loads order draft (404 not found, 409 already submitted)
//   - Server-side reprices items (never trust client prices)
//   - Computes tier (maly/sredni/duzy) iteratively based on total
//   - Generates order_number via DB function
//   - Updates order + inserts order_items snapshots (atomic-ish — TODO RPC
//     transaction у 1.B.3)
//
// Service-role bypasses RLS. Authorization = access_token UUID match.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

const SubmitSchema = z.object({
  contact_person: z.string().min(2, 'Imię i nazwisko (min. 2 znaki)').max(100),
  contact_phone: z.string().min(9, 'Telefon (min. 9 cyfr)').max(20),
  contact_email: z.string().email('Niepoprawny e-mail').max(100),
  delivery_address: z.string().min(5, 'Adres dostawy (min. 5 znaków)').max(300),
  preferred_delivery_date: z.string().optional().nullable(),
  customer_notes: z.string().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        product_id: z.string().regex(UUID_RE, 'Niepoprawne ID produktu'),
        qty: z.number().int().min(1).max(9999),
      }),
    )
    .min(1, 'Wybierz przynajmniej jeden produkt'),
})

type RouteContext = { params: Promise<{ token: string }> }

type Tier = 'maly' | 'sredni' | 'duzy'

function calcTier(net: number): Tier {
  if (net < 2000) return 'maly'
  if (net <= 4000) return 'sredni'
  return 'duzy'
}

const TIER_PRICE: Record<Tier, 'price_maly_opt' | 'price_sredni' | 'price_duzy'> = {
  maly: 'price_maly_opt',
  sredni: 'price_sredni',
  duzy: 'price_duzy',
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { token } = await ctx.params
  if (!UUID_RE.test(token)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny token' },
      { status: 400 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny format danych' },
      { status: 400 },
    )
  }

  const parsed = SubmitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Błędy w formularzu',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    )
  }
  const input = parsed.data

  let supabase
  try {
    supabase = createAdminClient()
  } catch (e: any) {
    console.error('[orders][token][POST] admin client init failed', {
      message: e?.message,
      key_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      url_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    })
    return NextResponse.json(
      { ok: false, error: 'Configuration error', debug: e?.message },
      { status: 500 },
    )
  }

  // Load order draft
  const { data: order, error: loadErr } = await supabase
    .from('orders')
    .select('id, status')
    .eq('access_token', token)
    .maybeSingle()
  if (loadErr) {
    console.error('[orders][token][POST] DB load failed', {
      token: token.substring(0, 8) + '...',
      error_code: (loadErr as any).code,
      error_message: loadErr.message,
      error_details: (loadErr as any).details,
      error_hint: (loadErr as any).hint,
      key_length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length,
      key_dots: process.env.SUPABASE_SERVICE_ROLE_KEY?.split('.').length,
      key_prefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20),
      url_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    })
    return NextResponse.json(
      { ok: false, error: 'Błąd bazy danych', debug: loadErr.message },
      { status: 500 },
    )
  }
  if (!order) {
    return NextResponse.json(
      { ok: false, error: 'Zamówienie nie zostało znalezione' },
      { status: 404 },
    )
  }
  if (order.status !== 'draft') {
    return NextResponse.json(
      { ok: false, error: 'Zamówienie zostało już złożone' },
      { status: 409 },
    )
  }

  // Load products to verify pricing server-side (never trust client prices)
  const productIds = input.items.map((i) => i.product_id)
  const { data: products } = await supabase
    .from('products')
    .select(
      'id, name, display_name, gramatura, price_maly_opt, price_sredni, price_duzy, show_in_orders',
    )
    .in('id', productIds)
  if (!products || products.length !== productIds.length) {
    return NextResponse.json(
      { ok: false, error: 'Niektóre produkty nie istnieją' },
      { status: 400 },
    )
  }
  if (products.some((p) => !p.show_in_orders)) {
    return NextResponse.json(
      { ok: false, error: 'Produkt niedostępny w zamówieniu' },
      { status: 400 },
    )
  }

  // Compute tier iteratively (same logic as UI mockup) — max 3 iterations
  // converges бо tier transitions monotonic.
  let tier: Tier = 'maly'
  let total = 0
  for (let i = 0; i < 3; i++) {
    const priceKey = TIER_PRICE[tier]
    total = input.items.reduce((sum, item) => {
      const p = products.find((pp) => pp.id === item.product_id)!
      return sum + item.qty * Number(p[priceKey])
    }, 0)
    const newTier = calcTier(total)
    if (newTier === tier) break
    tier = newTier
  }
  const priceKey = TIER_PRICE[tier]
  const totalNet = total
  const totalVat = Math.round(totalNet * 0.05 * 100) / 100
  const totalBrutto = Math.round((totalNet + totalVat) * 100) / 100

  // Generate order_number via DB function
  const { data: numRow } = await supabase.rpc('generate_order_number')
  const orderNumber =
    (numRow as unknown as string) || `ZIO-${new Date().getFullYear()}-0000`

  // Update orders + insert items (TODO transactional RPC у 1.B.3)
  const now = new Date().toISOString()
  const { error: updErr } = await supabase
    .from('orders')
    .update({
      order_number: orderNumber,
      status: 'submitted',
      contact_person: input.contact_person,
      contact_phone: input.contact_phone,
      contact_email: input.contact_email,
      delivery_address: input.delivery_address,
      preferred_delivery_date: input.preferred_delivery_date || null,
      customer_notes: input.customer_notes || null,
      tier_at_submit: tier,
      total_net: totalNet.toFixed(2),
      total_vat: totalVat.toFixed(2),
      total_brutto: totalBrutto.toFixed(2),
      submitted_at: now,
      updated_at: now,
    })
    .eq('id', order.id)
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: 'Błąd zapisu zamówienia' },
      { status: 500 },
    )
  }

  // Insert order_items snapshot (frozen name + gramatura + unit_price)
  const itemsToInsert = input.items.map((item) => {
    const p = products.find((pp) => pp.id === item.product_id)!
    const unitPrice = Number(p[priceKey])
    return {
      order_id: order.id,
      product_id: item.product_id,
      product_name_snapshot: p.display_name || p.name,
      gramatura_snapshot: p.gramatura,
      qty: item.qty,
      unit_price: unitPrice.toFixed(2),
      line_total: (item.qty * unitPrice).toFixed(2),
    }
  })
  const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert)
  if (itemsErr) {
    return NextResponse.json(
      { ok: false, error: 'Błąd zapisu pozycji zamówienia' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    order_number: orderNumber,
    tier,
    total_net: totalNet,
    total_vat: totalVat,
    total_brutto: totalBrutto,
  })
}
