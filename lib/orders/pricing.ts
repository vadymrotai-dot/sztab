// lib/orders/pricing.ts
// Faza 1 DAGOLD — Task #14 display parity: JEDNA wspólna logika ceny new-path
// (marża bazowa), używana i przez submit (POST), i przez GET (wyświetlanie),
// i przez order-form (przeglądanie), i przez admin/items — żeby cena widziana
// przez klienta nie mogła się już rozjechać z ceną liczoną przy submit.
//
// Formuła BEZ zmian względem Fazy 1:
//   segmentA_price = cost_pln / (1 − marza_bazowa_pct)
//   cena = segmentA_price × (1 − zniżka_klienta)
// marża NULL → null (fallback na starą matrycę). cost_pln<=0 przy ustawionej
// marży → NaN (błąd danych — caller robi guard).

import type { SupabaseClient } from '@supabase/supabase-js'

export interface NewPriceProduct {
  marza_bazowa_pct: number | string | null
  cost_pln: number | string | null
}

export function computeNewUnitPrice(
  p: NewPriceProduct,
  clientDiscount: number,
  marginBump = 0,
): number | null {
  if (p.marza_bazowa_pct == null) return null
  // marginBump — ресторанна націнка (+п.п. до маржі), 0 для звичайних клієнтів.
  const marza = Math.min(Number(p.marza_bazowa_pct) + (Number(marginBump) || 0), 0.95)
  const cost = Number(p.cost_pln ?? 0)
  if (!(cost > 0) || !(marza < 1)) return NaN
  return Math.round((cost / (1 - marza)) * (1 - clientDiscount) * 100) / 100
}

export const hasNewPrice = (p: NewPriceProduct): boolean =>
  p.marza_bazowa_pct != null

// Krok DAGOLD — rozdzielona zniżka klienta:
//   ogolna → ЧМ + ryby + reszta (indywidualna ?? segment ?? 0)
//   kalmar → GLOBAL FOOD (kalmary/przekąski): osobna indywidualna ?? 0
// Brak zniżki kalmarów → na kalmary działają progi wolumenowe. Segment dotyczy
// tylko części OGÓLNEJ (nie kalmarów). Clamp 0..0.95.
export interface ClientDiscounts {
  ogolna: number
  kalmar: number
  // Ресторанна націнка (+п.п. до маржі) для AVIS-D/ЧМ/Karol. 0 = звичайний клієнт.
  restaurantMarkup: number
}

// Постачальники, до яких застосовується ресторанна націнка.
// Karol виключено: його база вже на рівні крафт-роздробу (~50/кг), +15 п.п.
// перевищила б роздріб → ресторан платить базу (яка вже роздрібна).
export const RESTAURANT_MARKUP_SUPPLIERS = new Set<string>([
  '0f27ad77-a8be-431f-bb1a-1ca537424307', // AVIS-D (риба Латвія) — база нижче роздробу
  'a75927f4-eb9b-426e-b901-4a106c33e7e6', // Czudowa Marka — база нижче роздробу
])

// Фіксована роздрібна націнка (+п.п. до маржі) для клієнтів з retail_pricing=true.
export const RETAIL_MARKUP = 0.15

// Націнка для конкретного товару: тільки для scoped-постачальників.
export function markupForSupplier(
  supplierId: string | null | undefined,
  markup: number,
): number {
  if (!supplierId || !(markup > 0)) return 0
  return RESTAURANT_MARKUP_SUPPLIERS.has(supplierId) ? markup : 0
}

const clampFrac = (d: number): number => {
  if (!Number.isFinite(d) || d < 0) return 0
  return d > 0.95 ? 0.95 : d
}

// Przyjmuje dowolny klient Supabase (server albo admin/service-role).
export async function resolveClientDiscount(
  supabase: SupabaseClient,
  clientId: string | null | undefined,
): Promise<ClientDiscounts> {
  if (!clientId) return { ogolna: 0, kalmar: 0, restaurantMarkup: 0 }
  const { data: cli } = await supabase
    .from('clients')
    .select(
      'price_segment_code, znizka_indywidualna_pct, znizka_indywidualna_kalmar_pct, retail_pricing',
    )
    .eq('id', clientId)
    .maybeSingle()
  if (!cli) return { ogolna: 0, kalmar: 0, restaurantMarkup: 0 }

  let ogolna = 0
  if (cli.znizka_indywidualna_pct != null) {
    ogolna = Number(cli.znizka_indywidualna_pct)
  } else if (cli.price_segment_code) {
    const { data: seg } = await supabase
      .from('price_segments')
      .select('znizka_pct')
      .eq('code', cli.price_segment_code)
      .maybeSingle()
    if (seg?.znizka_pct != null) ogolna = Number(seg.znizka_pct)
  }
  const kalmar =
    cli.znizka_indywidualna_kalmar_pct != null
      ? Number(cli.znizka_indywidualna_kalmar_pct)
      : 0
  return {
    ogolna: clampFrac(ogolna),
    kalmar: clampFrac(kalmar),
    // Роздрібна ціна: позначка retail_pricing → фіксована націнка +15 п.п.
    restaurantMarkup: cli.retail_pricing ? RETAIL_MARKUP : 0,
  }
}
