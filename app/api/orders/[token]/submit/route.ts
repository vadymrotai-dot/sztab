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
import {
  computeNewUnitPrice,
  hasNewPrice as hasNewPriceFn,
  resolveClientDiscount,
  markupForSupplier,
} from '@/lib/orders/pricing'
// Krok 3 DAGOLD — rabaty wolumenowe per grupa (supplier). Serwerowa (autorytatywna)
// wersja tej samej logiki co order-form → parity display==charge.
import {
  groupDiscounts,
  effectiveLineDiscount,
  normalizeQty,
} from '@/lib/orders/discount-tiers'
// Sprint T-ORDER.1 (30.05.2026) — usunięto `after()` + processProforma import.
// Proforma teraz wysyłana ręcznie przez admina (przycisk "Potwierdź i wyślij
// proformę" w panelu zamówienia → POST /api/orders/admin/[id]/send-proforma).
// Klient po submit widzi "Vadym potwierdzi i wyśle proformę".

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

// Poprawki 1B — kanoniczny tekst zgody marketingowej (snapshot zapisywany w clients).
const MARKETING_CONSENT_TEXT =
  'Zgadzam się na otrzymywanie ofert handlowych i informacji marketingowych od DAGOLD sp. z o.o. drogą elektroniczną (e-mail). Zgodę mogę wycofać w każdej chwili.'

// Sprint T-ORDER.4b-API (30.05.2026) — rozszerzenie o wielopunktowość.
// delivery_address + preferred_delivery_date zostają OPTIONAL (back-compat dla
// 1-punktowego payload). delivery_mode='jeden' (default) = stary tryb albo nowy
// payload z jednym punktem strukturyzowanym. delivery_mode='kilka' wymaga
// delivery_points >=2 + items muszą mieć delivery_point_index.
// UI 4b-UI dosyła nowy payload; stary klient (curl, legacy) działa nadal.

const DeliveryPointSchema = z
  .object({
    label: z.string().max(100).optional().nullable(),
    // Bug B (odbiór własny) — adres opcjonalny; wymagany tylko dla typ='dostawa' (refine niżej).
    ulica: z.string().max(200).optional().nullable(),
    kod_pocztowy: z.string().max(10).optional().nullable(),
    miasto: z.string().max(100).optional().nullable(),
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
  // Bug B — adres (ulica+miasto min. 2 znaki) wymagany TYLKO dla dostawy.
  // Odbiór własny (typ='odbior') — klient odbiera z magazynu, adres niepotrzebny.
  .refine(
    (p) =>
      p.typ === 'odbior' ||
      ((p.ulica?.trim().length ?? 0) >= 2 && (p.miasto?.trim().length ?? 0) >= 2),
    {
      message: 'Ulica i miasto wymagane dla dostawy',
      path: ['ulica'],
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
  // Poprawki 1B — dobrowolna zgoda marketingowa (nie blokuje submitu).
  marketing_consent: z.boolean().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().regex(UUID_RE, 'Niepoprawne ID produktu'),
        qty: z.number().min(0.1).max(9999),
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
  // Przejście 1A — also fetch client_id + clients.owner_id dla auto-zapisu
  // punktów dostawy do profilu klienta (client_delivery_points).
  const { data: order, error: loadErr } = await supabase
    .from('orders')
    .select('id, status, cennik_tier, price_mode, client_id, client:clients!inner(owner_id, marketing_consent)')
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
  // Przejście 2A-fix — DEDUP product_id. Multipoint: ten sam produkt w kilku
  // punktach daje duplikaty w items; .in() zwraca distinct → products.length <
  // productIds.length → fałszywe "Niektóre produkty nie istnieją". Ceny i
  // order_items używają products.find(p => p.id === ...), więc dedup bezpieczny
  // (per-item zapis z delivery_point_index pozostaje bez zmian).
  const productIds = [...new Set(input.items.map((i) => i.product_id))]
  const { data: products } = await supabase
    .from('products')
    .select(
      // Sprint T-ORDER.4b-API — dodano `unit` dla snapshotu pozycji (unit_snapshot).
      // Przejście 2A — dodano `grupa` (podział CM/seafood) i `vat_rate` (VAT mieszany).
      // Faza 1 DAGOLD (089) — marza_bazowa_pct + cost_pln dla nowego price-path.
      'id, name, display_name, gramatura, unit, grupa, vat_rate, price_maly_opt, price_sredni, price_duzy, price_duzi_gracze, price_hurt_wh, marza_bazowa_pct, cost_pln, supplier_id, show_in_orders, stock_level, reserved_qty',
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

  // Krok DAGOLD — normalizacja ilości (autorytatywnie, niezależnie od frontu):
  // ryby AVIS-D → dziesiętne (0.1 kg), pozostałe grupy → całkowite. qty <= 0 odrzuć.
  for (const it of input.items) {
    const p = products.find((pp) => pp.id === it.product_id)
    it.qty = normalizeQty(
      (p as { supplier_id?: string | null } | undefined)?.supplier_id ?? null,
      it.qty,
    )
  }
  if (input.items.some((it) => !(it.qty > 0))) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawna ilość produktu' },
      { status: 400 },
    )
  }

  // Ф1 magazyn — blok zamówienia ponad stan (autorytatywnie na serwerze).
  // Tylko produkty zarządzane magazynowo (stock_level != null). available =
  // stock_level − reserved_qty. Sumujemy qty per produkt (multipoint).
  {
    const qtyByProduct = new Map<string, number>()
    for (const it of input.items) {
      qtyByProduct.set(
        it.product_id,
        (qtyByProduct.get(it.product_id) ?? 0) + it.qty,
      )
    }
    for (const p of products as any[]) {
      if (p.stock_level == null) continue
      const available = Math.max(
        0,
        Number(p.stock_level) - Number(p.reserved_qty || 0),
      )
      const wanted = qtyByProduct.get(p.id) ?? 0
      if (wanted > available) {
        return NextResponse.json(
          {
            ok: false,
            error: `Niewystarczający stan magazynowy: ${p.display_name || p.name} — dostępne ${available} ${p.unit || 'szt'}, zamówiono ${wanted}`,
          },
          { status: 409 },
        )
      }
    }
  }

  // Przejście 2A — ceny dla zamówienia MIESZANEGO (CM + owoce morza).
  // Każda grupa liczy SWÓJ poziom wg SWOJEJ osi, jeden price_mode na całość:
  //   - Czudowa Marka / nie-seafood: istniejąca matryca cennik_tier×price_mode,
  //     poziom wg sumy ZŁ netto pozycji CM (calcTier 2k/4k, WH itd) — BEZ ZMIAN.
  //   - owoce_morza: TYLKO standard (ignoruje cennik_tier=wielki_hurt), poziom wg
  //     sumy SZTUK seafood (1 szt = 1 kg): <100 maly, 100..300 (włącznie) sredni, >300 duzy.
  //     price_mode='minimum' → zawsze 'duzy' (cena minimalna), niezależnie od ilości.
  // VAT liczony per-pozycja wg product.vat_rate (CM 0.05, kalmary 0.23, putasu 0.05).
  const cennikTier: 'standard' | 'wielki_hurt' =
    order.cennik_tier === 'wielki_hurt' ? 'wielki_hurt' : 'standard'
  const priceMode: 'auto' | 'minimum' = order.price_mode === 'minimum' ? 'minimum' : 'auto'

  // ── Faza 1 DAGOLD (089) — NOWY price-path ──────────────────────────────────
  // cena = segmentA_price(produkt) × (1 − znizka_klienta)
  //   segmentA_price = cost_pln / (1 − marza_bazowa_pct)
  //   znizka = clients.znizka_indywidualna_pct
  //            ?? price_segments.znizka_pct (po clients.price_segment_code)
  //            ?? 0
  // Stosowane TYLKO gdy produkt ma marza_bazowa_pct != NULL. Inaczej — stara
  // matryca poniżej (nietknięta) jako fallback.
  // Task #14 — zniżka klienta z wspólnej funkcji (ta sama co GET/order-form).
  const znizkaKlienta = await resolveClientDiscount(
    supabase,
    (order as { client_id?: string }).client_id ?? null,
  )

  // Krok 3 DAGOLD — rabaty wolumenowe per grupa (supplier_id).
  //   base = cena A (bez rabatu) = computeNewUnitPrice(p, 0)
  //   próg per grupa liczony z Σ(base × qty) tej grupy → -5% / -8%
  //   rabat indywidualny klienta (znizkaKlienta) > 0 PRZEBIJA progi (override)
  // Baza (cena A, zaokrąglona do grosza) identyczna jak base_unit_price w GET →
  // ta sama podstawa progów po stronie klienta i serwera (parity).
  const baseUnit = (p: (typeof products)[number]): number | null =>
    computeNewUnitPrice(
      p as { marza_bazowa_pct?: number | string | null; cost_pln?: number | string | null },
      0,
      markupForSupplier(
        (p as { supplier_id?: string | null }).supplier_id ?? null,
        znizkaKlienta.restaurantMarkup,
      ),
    )
  const volLines = input.items
    .map((it) => {
      const p = products.find((pp) => pp.id === it.product_id)
      if (!p) return null
      const b = baseUnit(p)
      if (b == null || Number.isNaN(b)) return null // nie new-path albo błąd danych
      return {
        supplierId: (p as { supplier_id?: string | null }).supplier_id ?? null,
        baseUnitPrice: b,
        qty: it.qty,
      }
    })
    .filter(
      (x): x is { supplierId: string | null; baseUnitPrice: number; qty: number } =>
        x != null,
    )
  const grpDisc = groupDiscounts(volLines)

  // Nowa cena jednostkowa gdy produkt ma marza_bazowa_pct. NULL → stary flow.
  // NaN → marża ustawiona, ale brak cost_pln > 0 (błąd danych — guard niżej).
  // Rabat efektywny = override indywidualny albo wolumenowy grupy.
  const newUnitPrice = (p: (typeof products)[number]): number | null =>
    computeNewUnitPrice(
      p as { marza_bazowa_pct?: number | string | null; cost_pln?: number | string | null },
      effectiveLineDiscount(
        (p as { supplier_id?: string | null }).supplier_id ?? null,
        znizkaKlienta,
        grpDisc,
      ),
      markupForSupplier(
        (p as { supplier_id?: string | null }).supplier_id ?? null,
        znizkaKlienta.restaurantMarkup,
      ),
    )

  const newPriceBroken = products.filter(
    (p) =>
      (p as { marza_bazowa_pct?: unknown }).marza_bazowa_pct != null &&
      Number.isNaN(newUnitPrice(p) as number),
  )
  if (newPriceBroken.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Produkt ma marżę bazową, ale brak kosztu (cost_pln): ' +
          newPriceBroken.map((p) => p.display_name || p.name).join(', '),
      },
      { status: 400 },
    )
  }

  const hasNewPrice = (pid: string): boolean => {
    const p = products.find((pp) => pp.id === pid)
    return !!p && hasNewPriceFn(p as { marza_bazowa_pct?: number | string | null; cost_pln?: number | string | null })
  }
  // ───────────────────────────────────────────────────────────────────────────

  const isSeafood = (pid: string): boolean =>
    products.find((pp) => pp.id === pid)?.grupa === 'owoce_morza'
  // Stara matryca liczy poziom TYLKO na pozycjach bez marza_bazowa_pct (fallback).
  const oldItems = input.items.filter((it) => !hasNewPrice(it.product_id))
  const cmItems = oldItems.filter((it) => !isSeafood(it.product_id))
  const seafoodItems = oldItems.filter((it) => isSeafood(it.product_id))

  // Suma (qty × cena[priceKey]) po PODZBIORZE pozycji. NaN gdy brak ceny (null).
  const sumSubset = (
    items: typeof input.items,
    priceKey: keyof (typeof products)[number],
  ): number =>
    items.reduce((sum, item) => {
      const p = products.find((pp) => pp.id === item.product_id)!
      const raw = p[priceKey] as number | string | null
      if (raw == null) return NaN
      return sum + item.qty * Number(raw)
    }, 0)

  // ── Gałąź CM (Czudowa Marka i inne nie-seafood) — istniejąca matryca 2x2 ──
  let cmTier: TierAtSubmit | null = null
  let cmTotal = 0
  if (cmItems.length > 0) {
    const cmProducts = products.filter((p) => p.grupa !== 'owoce_morza')
    if (cennikTier === 'wielki_hurt' && priceMode === 'auto') {
      const missingHurt = cmProducts.filter((p) => p.price_hurt_wh == null)
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
      const hurtNominal = sumSubset(cmItems, 'price_hurt_wh')
      if (hurtNominal >= WH_HURT_THRESHOLD) {
        cmTier = 'wielki_hurt'
        cmTotal = sumSubset(cmItems, 'price_duzi_gracze')
      } else {
        cmTier = 'wielki_hurt_entry'
        cmTotal = hurtNominal
      }
    } else if (cennikTier === 'wielki_hurt') {
      cmTier = 'wielki_hurt'
      cmTotal = sumSubset(cmItems, 'price_duzi_gracze')
    } else if (priceMode === 'minimum') {
      cmTier = 'duzy'
      cmTotal = sumSubset(cmItems, 'price_duzy')
    } else {
      let stdTier: StandardTier = 'maly'
      for (let i = 0; i < 3; i++) {
        cmTotal = sumSubset(cmItems, TIER_PRICE[stdTier])
        const newTier = calcTier(cmTotal)
        if (newTier === stdTier) break
        stdTier = newTier
      }
      cmTier = stdTier
    }
  }

  // ── Gałąź owoce_morza — TYLKO standard, poziom wg sumy SZTUK ──
  let seafoodTier: StandardTier | null = null
  let seafoodTotal = 0
  if (seafoodItems.length > 0) {
    const totalSzt = seafoodItems.reduce((sum, it) => sum + it.qty, 0)
    seafoodTier =
      priceMode === 'minimum'
        ? 'duzy'
        : totalSzt < 100
          ? 'maly'
          : totalSzt <= 300
            ? 'sredni'
            : 'duzy'
    const sfKey = TIER_PRICE[seafoodTier] // tylko 3 standardowe kolumny
    // Guard: dla seafood cena null LUB 0 = brak ceny (tylko 3 standardowe kolumny).
    const sfMissing = seafoodItems
      .map((it) => products.find((pp) => pp.id === it.product_id)!)
      .filter((p) => {
        const v = (p as Record<string, unknown>)[sfKey] as number | string | null
        return v == null || Number(v) <= 0
      })
    if (sfMissing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Produkty bez ceny (owoce morza): ' +
            sfMissing.map((p) => p.display_name || p.name).join(', '),
        },
        { status: 400 },
      )
    }
    seafoodTotal = sumSubset(seafoodItems, sfKey)
  }

  if (!Number.isFinite(cmTotal) || !Number.isFinite(seafoodTotal)) {
    return NextResponse.json(
      { ok: false, error: 'Brak ceny dla produktu w wybranym cenniku — skontaktuj się z dostawcą' },
      { status: 400 },
    )
  }

  // Cena jednostkowa per-pozycja wg właściwej gałęzi (CM albo seafood).
  const cmPriceKey = cmTier ? TIER_PRICE[cmTier] : null
  const seafoodPriceKey = seafoodTier ? TIER_PRICE[seafoodTier] : null
  const unitPriceFor = (p: (typeof products)[number]): number => {
    // Faza 1 DAGOLD (089) — nowy price-path ma pierwszeństwo gdy marża ustawiona.
    const np = newUnitPrice(p)
    if (np != null && !Number.isNaN(np)) return np
    const key = p.grupa === 'owoce_morza' ? seafoodPriceKey : cmPriceKey
    return key ? Number((p as Record<string, unknown>)[key]) : 0
  }

  // tier_at_submit (TEXT free-form) — reprezentatywny: CM jeśli jest, inaczej seafood.
  const tier: TierAtSubmit = cmTier ?? seafoodTier ?? 'maly'

  // Faza 1 DAGOLD (089) — totalNet z sumy per-pozycja przez unitPriceFor:
  //   - nowy price-path (marża) → segmentA × (1 − znizka)
  //   - stary (fallback) → identyczne z cmTotal+seafoodTotal (ta sama kolumna/tier)
  // VAT (netByVat niżej) też liczony przez unitPriceFor → spójne.
  const totalNet =
    Math.round(
      input.items.reduce((sum, item) => {
        const p = products.find((pp) => pp.id === item.product_id)!
        return sum + item.qty * unitPriceFor(p)
      }, 0) * 100,
    ) / 100

  // VAT MIESZANY — księgowo: VAT liczony na sumie netto KAŻDEJ stawki osobno,
  // zaokrąglony do grosza per stawka, potem suma (zamiast globalnego *0.05).
  const netByVat = new Map<number, number>()
  for (const item of input.items) {
    const p = products.find((pp) => pp.id === item.product_id)!
    const net = item.qty * unitPriceFor(p)
    const rate = Number((p as { vat_rate?: number | string | null }).vat_rate ?? 0)
    netByVat.set(rate, (netByVat.get(rate) ?? 0) + net)
  }
  let totalVat = 0
  for (const [rate, net] of netByVat) {
    totalVat += Math.round(net * rate * 100) / 100
  }
  totalVat = Math.round(totalVat * 100) / 100
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
    // Przejście 1A — auto-zapis każdego punktu do profilu klienta
    // (client_delivery_points) + link client_delivery_point_id. Dedup po
    // client_id + ulica + miasto (case-insensitive trim). Geo lat/lng NULL
    // (Google Maps później). SOFT-FAIL: błąd zapisu profilu NIE blokuje
    // złożenia zamówienia (link zostaje NULL). PRICING NIETKNIĘTY.
    const clientId = (order as { client_id?: string }).client_id ?? null
    const ownerId =
      (order as { client?: { owner_id?: string } }).client?.owner_id ?? null

    const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
    const dedupKey = (
      ulica: string | null | undefined,
      miasto: string | null | undefined,
    ) => `${norm(ulica)}|${norm(miasto)}`

    // Mapa istniejących aktywnych punktów klienta (dedup).
    const savedByKey = new Map<string, string>()
    if (clientId && ownerId) {
      const { data: existing } = await supabase
        .from('client_delivery_points')
        .select('id, ulica, miasto')
        .eq('client_id', clientId)
        .eq('is_active', true)
      for (const sp of (existing ?? []) as Array<{
        id: string
        ulica: string | null
        miasto: string | null
      }>) {
        savedByKey.set(dedupKey(sp.ulica, sp.miasto), sp.id)
      }
    }

    // Resolve client_delivery_point_id per punkt (existing albo nowy insert).
    const clientPointIds: Array<string | null> = []
    for (const dp of input.delivery_points) {
      let cdpId: string | null = null
      const hasAddr =
        !!dp.ulica &&
        dp.ulica.trim().length > 0 &&
        !!dp.miasto &&
        dp.miasto.trim().length > 0
      if (clientId && ownerId && hasAddr) {
        const key = dedupKey(dp.ulica, dp.miasto)
        const found = savedByKey.get(key)
        if (found) {
          cdpId = found
        } else {
          const nazwa = (
            dp.label && dp.label.trim().length > 0
              ? dp.label.trim()
              : `${dp.ulica!.trim()}, ${dp.miasto!.trim()}`
          ).slice(0, 200)
          const { data: newCdp, error: cdpErr } = await supabase
            .from('client_delivery_points')
            .insert({
              client_id: clientId,
              owner_id: ownerId,
              nazwa,
              ulica: dp.ulica,
              kod_pocztowy: dp.kod_pocztowy || null,
              miasto: dp.miasto,
              odbiorca_imie: dp.odbiorca_imie || null,
              odbiorca_telefon: dp.odbiorca_telefon || null,
            })
            .select('id')
            .single()
          if (cdpErr || !newCdp) {
            console.error(
              '[orders][token][POST] client_delivery_point upsert failed:',
              cdpErr?.message,
            )
          } else {
            cdpId = newCdp.id
            savedByKey.set(key, newCdp.id) // dedup w obrębie tego payloadu
          }
        }
      }
      clientPointIds.push(cdpId)
    }

    const pointsToInsert = input.delivery_points.map((dp, idx) => ({
      order_id: order.id,
      client_delivery_point_id: clientPointIds[idx],
      label: dp.label || null,
      // Bug B — odbiór własny może mieć pusty adres → NULL (kolumny nullable, mig 078).
      ulica: dp.ulica || null,
      kod_pocztowy: dp.kod_pocztowy || null,
      miasto: dp.miasto || null,
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
  // Przejście 2A — unit_price wg gałęzi pozycji (CM albo seafood) przez unitPriceFor.
  const itemsToInsert = input.items.map((item) => {
    const p = products.find((pp) => pp.id === item.product_id)!
    const unitPrice = unitPriceFor(p)
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

  // Poprawki 1B — zgoda marketingowa (dobrowolna). Zapis tylko gdy klient
  // zaznaczył i jeszcze nie ma zgody — NIE nadpisujemy daty istniejącej zgody.
  if (input.marketing_consent === true) {
    const already =
      (order as { client?: { marketing_consent?: boolean } }).client?.marketing_consent === true
    if (!already && order.client_id) {
      const { error: mcErr } = await supabase
        .from('clients')
        .update({
          marketing_consent: true,
          marketing_consent_at: now,
          marketing_consent_text: MARKETING_CONSENT_TEXT,
        })
        .eq('id', order.client_id)
      if (mcErr) {
        console.error('[orders][token][POST] marketing_consent update failed:', mcErr.message)
      }
    }
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
