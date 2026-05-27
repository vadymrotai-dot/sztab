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

import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { processProforma } from '@/lib/orders/proforma-flow'

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

// Sprint S-CENNIK-WH.1 (26.05.2026) — wielki_hurt додано як 4-й tier (locked).
// Sprint S-CENNIK-WH.2 (26.05.2026) — matrix 2x2 (cennik_tier × price_mode):
//   standard + auto    → iterate maly/sredni/duzy (calcTier)
//   standard + minimum → locked 'duzy' (najnizsza standard cena)
//   wielki_hurt + auto → 10k threshold (hurt nominal): <10k 'wielki_hurt_entry', >=10k 'wielki_hurt'
//   wielki_hurt + min  → locked 'wielki_hurt' (price_duzi_gracze)
import { WH_HURT_THRESHOLD } from '@/lib/orders/tier-config'

type StandardTier = 'maly' | 'sredni' | 'duzy'
type TierAtSubmit = StandardTier | 'wielki_hurt' | 'wielki_hurt_entry'

function calcTier(net: number): StandardTier {
  if (net < 2000) return 'maly'
  if (net <= 4000) return 'sredni'
  return 'duzy'
}

const TIER_PRICE: Record<
  TierAtSubmit,
  'price_maly_opt' | 'price_sredni' | 'price_duzy' | 'price_duzi_gracze' | 'price_hurt_wh'
> = {
  maly: 'price_maly_opt',
  sredni: 'price_sredni',
  duzy: 'price_duzy',
  wielki_hurt: 'price_duzi_gracze',
  wielki_hurt_entry: 'price_hurt_wh',
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
    console.error('[orders][token] admin client init failed:', e?.message)
    return NextResponse.json(
      { ok: false, error: 'Configuration error' },
      { status: 500 },
    )
  }

  // Load order draft
  // Sprint S-CENNIK-WH.1 — also fetch cennik_tier (locked at offer-send).
  // Sprint S-CENNIK-WH.2 — also fetch price_mode (matrix 2x2).
  const { data: order, error: loadErr } = await supabase
    .from('orders')
    .select('id, status, cennik_tier, price_mode')
    .eq('access_token', token)
    .maybeSingle()
  if (loadErr) {
    console.error('[orders][token][POST] DB load failed:', loadErr.message)
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
      'id, name, display_name, gramatura, price_maly_opt, price_sredni, price_duzy, price_duzi_gracze, price_hurt_wh, show_in_orders',
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

  // Sprint S-CENNIK-WH.2 — Matrix 2x2 (cennik_tier × price_mode):
  //   standard + auto    → iterate maly/sredni/duzy (calcTier z 2k/4k thresholds)
  //   standard + minimum → locked 'duzy' (najnizsza standard cena)
  //   wielki_hurt + auto → 10k threshold (hurt nominal): <10k 'wielki_hurt_entry', >=10k 'wielki_hurt'
  //   wielki_hurt + min  → locked 'wielki_hurt' (price_duzi_gracze)
  const cennikTier: 'standard' | 'wielki_hurt' =
    order.cennik_tier === 'wielki_hurt' ? 'wielki_hurt' : 'standard'
  const priceMode: 'auto' | 'minimum' = order.price_mode === 'minimum' ? 'minimum' : 'auto'

  let tier: TierAtSubmit
  let total = 0

  const sumWithKey = (priceKey: keyof (typeof products)[number]): number =>
    input.items.reduce((sum, item) => {
      const p = products.find((pp) => pp.id === item.product_id)!
      const raw = p[priceKey] as number | string | null
      if (raw == null) {
        // Will be caught by the NaN check у caller; this prevents silent 0 substitution.
        return NaN
      }
      return sum + item.qty * Number(raw)
    }, 0)

  if (cennikTier === 'wielki_hurt' && priceMode === 'auto') {
    // Threshold based on Hurt nominal (entry-tier prices). Guard: всі SKU must have price_hurt_wh.
    const missingHurt = products.filter((p) => p.price_hurt_wh == null)
    if (missingHurt.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Produkty bez ceny w cenniku Hurt: ' +
            missingHurt.map((p) => p.display_name || p.name).join(', '),
        },
        { status: 400 },
      )
    }
    const hurtNominal = sumWithKey('price_hurt_wh')
    if (hurtNominal >= WH_HURT_THRESHOLD) {
      tier = 'wielki_hurt'
      total = sumWithKey('price_duzi_gracze')
    } else {
      tier = 'wielki_hurt_entry'
      total = hurtNominal
    }
  } else if (cennikTier === 'wielki_hurt') {
    // wielki_hurt + minimum (locked WH — current S-CENNIK-WH.1 behavior)
    tier = 'wielki_hurt'
    total = sumWithKey('price_duzi_gracze')
  } else if (priceMode === 'minimum') {
    // standard + minimum (locked duzy)
    tier = 'duzy'
    total = sumWithKey('price_duzy')
  } else {
    // standard + auto (existing 3-tier auto from S-ORDER.1.B.1)
    let stdTier: StandardTier = 'maly'
    for (let i = 0; i < 3; i++) {
      total = sumWithKey(TIER_PRICE[stdTier])
      const newTier = calcTier(total)
      if (newTier === stdTier) break
      stdTier = newTier
    }
    tier = stdTier
  }

  if (!Number.isFinite(total)) {
    return NextResponse.json(
      { ok: false, error: 'Brak ceny dla produktu w wybranym cenniku — skontaktuj się z dostawcą' },
      { status: 400 },
    )
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

  // Background task: create proforma + send email після response.
  // Sprint S-ORDER.2.A.3 (19.05.2026) — caller sees confirm immediately.
  // Sprint S-ORDER.2.A.3.2 (21.05.2026) — switched fire-and-forget → after()
  // from 'next/server'. Guarantees task completes до ~30s post-response на
  // Vercel (без `after` Vercel може kill function після response). Local dev:
  // no-op wrapper, executes inline.
  after(async () => {
    try {
      await processProforma(order.id)
    } catch (err: any) {
      console.error('[submit] processProforma background task failed', {
        orderId: order.id,
        error: err?.message,
      })
    }
  })

  return NextResponse.json({
    ok: true,
    order_number: orderNumber,
    tier,
    total_net: totalNet,
    total_vat: totalVat,
    total_brutto: totalBrutto,
  })
}
