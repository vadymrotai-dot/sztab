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
): number | null {
  if (p.marza_bazowa_pct == null) return null
  const marza = Math.min(Number(p.marza_bazowa_pct), 0.95)
  const cost = Number(p.cost_pln ?? 0)
  if (!(cost > 0) || !(marza < 1)) return NaN
  return Math.round((cost / (1 - marza)) * (1 - clientDiscount) * 100) / 100
}

export const hasNewPrice = (p: NewPriceProduct): boolean =>
  p.marza_bazowa_pct != null

// Server-only (DB): zniżka klienta = indywidualna ?? segment ?? 0, clamp 0..0.95.
// Przyjmuje dowolny klient Supabase (server albo admin/service-role).
export async function resolveClientDiscount(
  supabase: SupabaseClient,
  clientId: string | null | undefined,
): Promise<number> {
  if (!clientId) return 0
  const { data: cli } = await supabase
    .from('clients')
    .select('price_segment_code, znizka_indywidualna_pct')
    .eq('id', clientId)
    .maybeSingle()
  if (!cli) return 0

  let d = 0
  if (cli.znizka_indywidualna_pct != null) {
    d = Number(cli.znizka_indywidualna_pct)
  } else if (cli.price_segment_code) {
    const { data: seg } = await supabase
      .from('price_segments')
      .select('znizka_pct')
      .eq('code', cli.price_segment_code)
      .maybeSingle()
    if (seg?.znizka_pct != null) d = Number(seg.znizka_pct)
  }
  if (!Number.isFinite(d) || d < 0) d = 0
  return d > 0.95 ? 0.95 : d
}
