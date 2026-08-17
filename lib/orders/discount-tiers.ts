// lib/orders/discount-tiers.ts
// Krok 2-3 DAGOLD — rabaty wolumenowe per grupa produktowa (supplier).
//
// Model: klient dostaje cenę standardową (cena A = cost/(1−marża)) i "nabija"
// rabat w formularzu w miarę dodawania towaru. Próg liczony OSOBNO dla każdej
// grupy (supplier_id), od wartości NETTO grupy (base × qty, PRZED rabatem —
// żeby uniknąć zależności cyklicznej).
//
// Override (WAŻNE): jeśli klient ma rabat indywidualny/segmentowy > 0, to on
// obowiązuje na cały koszyk, a progi wolumenowe są WYŁĄCZONE (bez podwójnych
// rabatów) — spójnie z trybem operatora "Minimum locked".
//
// Grupy bez wpisu w VOLUME_TIERS (np. Karol — segment PL) → 0 rabatu wolumenowego.

export interface VolumeTier {
  t1_amount: number // próg 1 (PLN netto)
  t1_pct: number // rabat po progu 1 (ułamek)
  t2_amount: number // próg 2 (PLN netto)
  t2_pct: number // rabat po progu 2 (ułamek)
}

// Klucz = supplier_id (products.supplier_id).
export const VOLUME_TIERS: Record<string, VolumeTier> = {
  // Czudowa Marka (kiszonki/surówki)
  'a75927f4-eb9b-426e-b901-4a106c33e7e6': {
    t1_amount: 1000,
    t1_pct: 0.05,
    t2_amount: 2000,
    t2_pct: 0.08,
  },
  // AVIS-D (ryby z Łotwy)
  '0f27ad77-a8be-431f-bb1a-1ca537424307': {
    t1_amount: 1500,
    t1_pct: 0.05,
    t2_amount: 2500,
    t2_pct: 0.08,
  },
  // GLOBAL FOOD TRADING (kalmary / przekąski suszone)
  'd7a780ec-22cd-4013-960c-80884c342d5d': {
    t1_amount: 4000,
    t1_pct: 0.05,
    t2_amount: 8000,
    t2_pct: 0.08,
  },
}

export interface CartLine {
  supplierId: string | null
  baseUnitPrice: number // cena A (bez rabatu)
  qty: number
}

// Rabat wolumenowy dla grupy na podstawie jej sumy netto.
export function volumeDiscountForGroup(
  supplierId: string | null | undefined,
  groupNet: number,
): number {
  if (!supplierId) return 0
  const t = VOLUME_TIERS[supplierId]
  if (!t) return 0
  if (groupNet >= t.t2_amount) return t.t2_pct
  if (groupNet >= t.t1_amount) return t.t1_pct
  return 0
}

// Sumy netto per grupa (supplier_id) z koszyka.
export function groupNetTotals(lines: CartLine[]): Record<string, number> {
  const net: Record<string, number> = {}
  for (const l of lines) {
    if (!l.supplierId) continue
    const add = (Number(l.baseUnitPrice) || 0) * (Number(l.qty) || 0)
    net[l.supplierId] = (net[l.supplierId] ?? 0) + add
  }
  return net
}

// Rabat wolumenowy per grupa (supplier_id) z całego koszyka.
export function groupDiscounts(lines: CartLine[]): Record<string, number> {
  const net = groupNetTotals(lines)
  const out: Record<string, number> = {}
  for (const [sid, n] of Object.entries(net)) {
    out[sid] = volumeDiscountForGroup(sid, n)
  }
  return out
}

// Klucz grupy kalmarów/przekąsek (GLOBAL FOOD) — ma OSOBNĄ zniżkę indywidualną.
export const GLOBAL_FOOD_SUPPLIER_ID = 'd7a780ec-22cd-4013-960c-80884c342d5d'

// Ryby z Łotwy (AVIS-D) — JEDYNA grupa z ilościami ułamkowymi (kg, do dziesiętnych).
// Pozostałe grupy (ЧМ, kalmary) — ilości całkowite.
export const AVIS_D_SUPPLIER_ID = '0f27ad77-a8be-431f-bb1a-1ca537424307'

// Normalizacja ilości: ryby AVIS-D → dziesiętne (0.1), reszta → całkowite.
// Używane spójnie przez order-form, submit i admin (jedna reguła).
export function normalizeQty(
  supplierId: string | null | undefined,
  qty: number,
): number {
  if (!Number.isFinite(qty)) return 0
  if (supplierId === AVIS_D_SUPPLIER_ID) return Math.round(qty * 10) / 10
  return Math.round(qty)
}

// Rozdzielona zniżka indywidualna klienta.
export interface IndividualDiscounts {
  ogolna: number // ЧМ + ryby + reszta
  kalmar: number // GLOBAL FOOD (kalmary/przekąski)
}

// Efektywny rabat dla pozycji: rabat indywidualny (ogólny albo kalmarowy — wg
// grupy produktu) > 0 WYGRYWA (override), inaczej rabat wolumenowy grupy.
// Kalmary/przekąski bez zniżki kalmarowej → normalne progi wolumenowe. 0..0.95.
export function effectiveLineDiscount(
  supplierId: string | null,
  individual: IndividualDiscounts,
  discountsByGroup: Record<string, number>,
): number {
  const ind =
    supplierId === GLOBAL_FOOD_SUPPLIER_ID ? individual.kalmar : individual.ogolna
  let d = 0
  if (ind > 0) d = ind
  else if (supplierId) d = discountsByGroup[supplierId] ?? 0
  if (!Number.isFinite(d) || d < 0) return 0
  return d > 0.95 ? 0.95 : d
}

// Ile netto brakuje do następnego progu (dla UI). null = brak wyższego progu
// albo grupa nietaryfowa.
export function nextTierGap(
  supplierId: string | null,
  groupNet: number,
): { toPct: number; gap: number } | null {
  if (!supplierId) return null
  const t = VOLUME_TIERS[supplierId]
  if (!t) return null
  if (groupNet < t.t1_amount) return { toPct: t.t1_pct, gap: t.t1_amount - groupNet }
  if (groupNet < t.t2_amount) return { toPct: t.t2_pct, gap: t.t2_amount - groupNet }
  return null
}
