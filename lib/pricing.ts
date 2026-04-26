// Canonical pricing helpers shared by /products, /settings, the importer
// and (later) DealModal v2. Settings come from the `settings` key/value
// table — pass the raw rows in via settingsRowsToPricing() or assemble
// the object yourself in tests.

export interface PricingSettings {
  kurs_eur_pln: number
  overhead_multiplier: number
  margin_maly_opt: number // fraction, e.g. 0.50
  margin_sredni_opt: number
  margin_duzy_opt: number
  margin_strategic_katalog: number
  margin_strategic_docel: number
  threshold_sredni_pln: number
  threshold_duzy_pln: number
}

const DEFAULTS: PricingSettings = {
  kurs_eur_pln: 4.28,
  overhead_multiplier: 1.15,
  margin_maly_opt: 0.5,
  margin_sredni_opt: 0.4,
  margin_duzy_opt: 0.35,
  margin_strategic_katalog: 0.32,
  margin_strategic_docel: 0.23,
  threshold_sredni_pln: 1000,
  threshold_duzy_pln: 2500,
}

export function settingsRowsToPricing(
  rows: { key: string; value: string }[] | null | undefined,
): PricingSettings {
  const out: PricingSettings = { ...DEFAULTS }
  if (!rows) return out
  for (const r of rows) {
    const n = Number.parseFloat(r.value)
    if (!Number.isFinite(n)) continue
    if (r.key in out) {
      ;(out as unknown as Record<string, number>)[r.key] = n
    }
  }
  return out
}

export function computeCostPln(
  cost_eur: number,
  kurs: number,
  overhead: number,
): number {
  if (!Number.isFinite(cost_eur) || cost_eur <= 0) return 0
  return roundTo(cost_eur * kurs * overhead, 2)
}

// Selling price for a target margin %. cost / (1 - margin) is the
// well-known mark-up formula; capped to prevent infinity if the margin
// is misconfigured to >= 100%.
export function computePrice(cost_pln: number, margin: number): number {
  if (!Number.isFinite(cost_pln) || cost_pln <= 0) return 0
  const safeMargin = Math.max(0, Math.min(margin, 0.95))
  return roundTo(cost_pln / (1 - safeMargin), 2)
}

export interface PriceTiers {
  price_maly_opt: number
  price_sredni: number
  price_duzy: number
  price_duzi_gracze: number
  price_min: number
}

export function computePriceTiers(
  cost_pln: number,
  s: PricingSettings,
): PriceTiers {
  return {
    price_maly_opt: computePrice(cost_pln, s.margin_maly_opt),
    price_sredni: computePrice(cost_pln, s.margin_sredni_opt),
    price_duzy: computePrice(cost_pln, s.margin_duzy_opt),
    price_duzi_gracze: computePrice(cost_pln, s.margin_strategic_katalog),
    price_min: computePrice(cost_pln, s.margin_strategic_docel),
  }
}

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
