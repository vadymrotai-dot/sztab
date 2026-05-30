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
// Sprint T-ORDER.1 (30.05.2026) — usunięto `after()` + processProforma import.
// Proforma teraz wysyłana ręcznie przez admina (przycisk "Potwierdź i wyślij
// proformę" w panelu zamówienia → POST /api/orders/admin/[id]/send-proforma).
// Klient po submit widzi "Vadym potwierdzi i wyśle proformę".

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

// Sprint T-ORDER.4b-API (30.05.2026) — rozszerzenie o wielopunktowość.
// delivery_address + preferred_delivery_date zostają OPTIONAL (back-compat dla
// 1-punktowego payload). delivery_mode='jeden' (default) = stary tryb albo nowy
// payload z jednym punktem strukturyzowanym. delivery_mode='kilka' wymaga
// delivery_points >=2 + items muszą mieć delivery_point_index.
// UI 4b-UI dosyła nowy payload; stary klient (curl, legacy) działa nadal.

const DeliveryPointSchema = z
  .object({
    label: z.string().max(100).optional().nullable(),
    ulica: z.string().min(2, 'Ulica (min. 2 znaki)').max(200),
    kod_pocztowy: z.string().max(10).optional().nullable(),
    miasto: z.string().min(2, 'Miasto (min. 2 znaki)').max(100),
    typ: z.enum(['dostawa', 'odbior']).default('dostawa'),
    termin_typ: z.enum(['najblizszy', 'data']).default('najblizszy'),
    preferred_date: z.string().optional().nullable(),
    odbiorca_imie: z.string().max(150).optional().nullable(),
    odbiorca_telefon: z.string().max(20).optional().nullable(),
  })
  .refine(
    (p) =>
      p.termin_typ !== 'data' ||
      (typeof p.preferred_date === 'string' && p.preferred_date.length > 0),
    {
      message: 'preferred_date wymagane dla termin_typ=data',
      path: ['preferred_date'],
    },
  )

const SubmitSchema = z.object({
  contact_person: z.string().min(2, 'Imię i nazwisko (min. 2 znaki)').max(100),
  contact_phone: z.string().min(9, 'Telefon (min. 9 cyfr)').max(20),
  contact_email: z.string().email('Niepoprawny e-mail').max(100),
  // Sprint T-ORDER.4b-API — legacy fields (optional dla back-compat).
  delivery_address: z.string().min(5).max(300).optional().nullable(),
  preferred_delivery_date: z.string().optional().nullable(),
  customer_notes: z.string().max(1000).optional().nullable(),
  // Sprint T-ORDER.4b-API — nowe pola multipoint.
  delivery_mode: z.enum(['jeden', 'kilka']).optional().default('jeden'),
  documents_mode: z.enum(['wspolna', 'osobne']).optional().default('wspolna'),
  delivery_points: z.array(DeliveryPointSchema).optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().regex(UUID_RE, 'Niepoprawne ID produktu'),
        qty: z.number().int().min(1).max(9999),
        // Sprint T-ORDER.4b-API — indeks do delivery_points (UUID powstaje po INSERT).
        delivery_point_index: z.number().int().min(0).optional(),
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

  // Sprint T-ORDER.4b-API — walidacja krzyżowa multipoint.
  // delivery_mode='kilka' wymaga delivery_points >=2 i delivery_point_index na
  // każdej pozycji (w zakresie). 'jeden' bez delivery_points → fallback do
  // legacy delivery_address (min. 5 znaków). documents_mode='osobne' tylko gdy
  // delivery_mode='kilka' (dla jednego punktu rozdzielanie dokumentów nie ma sensu).
  if (input.delivery_mode === 'kilka') {
    if (!input.delivery_points || input.delivery_points.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Tryb "kilka punktów" wymaga przynajmniej 2 punktów dostawy',
        },
        { status: 422 },
      )
    }
    const dpCount = input.delivery_points.length
    for (const it of input.items) {
      if (it.delivery_point_index == null) {
        return NextResponse.json(
          { ok: false, error: 'Pozycja nieprzypisana do punktu dostawy' },
          { status: 422 },
        )
      }
      if (it.delivery_point_index < 0 || it.delivery_point_index >= dpCount) {
        return NextResponse.json(
          { ok: false, error: 'Niepoprawny indeks punktu dostawy' },
          { status: 422 },
        )
      }
    }
  }
  if (input.documents_mode === 'osobne' && input.delivery_mode !== 'kilka') {
    return NextResponse.json(
      {
        ok: false,
        error: 'Tryb dokumentów "osobne" dostępny tylko przy kilku punktach',
      },
      { status: 422 },
    )
  }
  if (
    input.delivery_mode === 'jeden' &&
    (!input.delivery_points || input.delivery_points.length === 0)
  ) {
    if (!input.delivery_address || input.delivery_address.trim().length < 5) {
      return NextResponse.json(
        { ok: false, error: 'Adres dostawy wymagany (min. 5 znaków)' },
        { status: 422 },
      )
    }
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
      // Sprint T-ORDER.4b-API — dodano `unit` dla snapshotu pozycji (unit_snapshot).
      'id, name, display_name, gramatura, unit, price_maly_opt, price_sredni, price_duzy, price_duzi_gracze, price_hurt_wh, show_in_orders',
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

  // Sprint T-ORDER.4b-API — dla back-compat starych raportów/admin views które
  // czytają orders.delivery_address/preferred_delivery_date: jeśli nowy payload
  // ma delivery_points, sklej "ulica, kod miasto" z pierwszego punktu i wypisz
  // tu (też preferred_date pierwszego punktu jeśli termin_typ='data'). Stary
  // payload z delivery_address — zachowujemy bez zmian.
  const firstPoint = input.delivery_points?.[0]
  const legacyAddressFromPoints = firstPoint
    ? [
        firstPoint.ulica,
        [firstPoint.kod_pocztowy, firstPoint.miasto].filter(Boolean).join(' '),
      ]
        .filter((s) => s && s.length > 0)
        .join(', ')
    : null
  const legacyDateFromPoints =
    firstPoint && firstPoint.termin_typ === 'data'
      ? firstPoint.preferred_date ?? null
      : null

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
      // Sprint T-ORDER.4b-API — fallback do sklejonego adresu z pierwszego punktu.
      delivery_address: input.delivery_address ?? legacyAddressFromPoints,
      preferred_delivery_date:
        input.preferred_delivery_date || legacyDateFromPoints || null,
      customer_notes: input.customer_notes || null,
      // Sprint T-ORDER.4b-API — tryby (default 'jeden'/'wspolna' z Zod default).
      delivery_mode: input.delivery_mode,
      documents_mode: input.documents_mode,
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

  // Sprint T-ORDER.4b-API — INSERT order_delivery_points (jeśli payload zawiera).
  // Supabase .insert(array).select() zachowuje kolejność wstawiania → mapowanie
  // delivery_point_index → realne UUID przez pointIds[index].
  let pointIds: string[] = []
  if (input.delivery_points && input.delivery_points.length > 0) {
    const pointsToInsert = input.delivery_points.map((dp) => ({
      order_id: order.id,
      label: dp.label || null,
      ulica: dp.ulica,
      kod_pocztowy: dp.kod_pocztowy || null,
      miasto: dp.miasto,
      typ: dp.typ,
      termin_typ: dp.termin_typ,
      preferred_date:
        dp.termin_typ === 'data' && dp.preferred_date ? dp.preferred_date : null,
      odbiorca_imie: dp.odbiorca_imie || null,
      odbiorca_telefon: dp.odbiorca_telefon || null,
    }))
    const { data: insertedPoints, error: pointsErr } = await supabase
      .from('order_delivery_points')
      .insert(pointsToInsert)
      .select('id')
    if (
      pointsErr ||
      !insertedPoints ||
      insertedPoints.length !== pointsToInsert.length
    ) {
      console.error(
        '[orders][token][POST] delivery_points insert failed:',
        pointsErr?.message,
      )
      return NextResponse.json(
        { ok: false, error: 'Błąd zapisu punktów dostawy' },
        { status: 500 },
      )
    }
    pointIds = (insertedPoints as Array<{ id: string }>).map((r) => r.id)
  }

  // Insert order_items snapshot (frozen name + gramatura + unit + unit_price)
  // Sprint T-ORDER.4b-API — dodano unit_snapshot + delivery_point_id.
  // PRICING NIETKNIĘTY: unit_price/line_total z priceKey jak wcześniej.
  const itemsToInsert = input.items.map((item) => {
    const p = products.find((pp) => pp.id === item.product_id)!
    const unitPrice = Number(p[priceKey])
    const unitSnap = (p as { unit?: string | null }).unit ?? 'szt'
    return {
      order_id: order.id,
      product_id: item.product_id,
      product_name_snapshot: p.display_name || p.name,
      gramatura_snapshot: p.gramatura,
      unit_snapshot: unitSnap,
      delivery_point_id:
        item.delivery_point_index != null && pointIds.length > 0
          ? pointIds[item.delivery_point_index]
          : null,
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

  // Sprint T-ORDER.1 (30.05.2026) — proforma NIE wysyłana automatycznie.
  // Wcześniej tu był `after(() => processProforma(order.id))`. Teraz Vadym
  // potwierdza zamówienie w panelu (/operacje/zamowienia/[id]) i klika
  // "Potwierdź i wyślij proformę" → POST /api/orders/admin/[id]/send-proforma.

  return NextResponse.json({
    ok: true,
    order_number: orderNumber,
    tier,
    total_net: totalNet,
    total_vat: totalVat,
    total_brutto: totalBrutto,
  })
}
