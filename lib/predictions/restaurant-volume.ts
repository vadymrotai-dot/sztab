// lib/predictions/restaurant-volume.ts
// Sprint S6D Day 4 (12.05.2026) — restaurant monthly volume prediction (Tier 1).
//
// Algorithm v1.0 — evidence-based:
//   reviews/months → customers/mes × subtype_frequency → visits/mes
//
// Conversion factors (research-backed):
//   LOW  = 10 — 10% guests leave reviews (Toast 2023 survey)
//   MID  = 15 — industry consensus + Polish market adjustment
//   HIGH = 25 — newer restaurants don't ask for reviews
//
// Subtype frequencies (visits per customer per month):
//   sushi_bar: 2.5  — moderate repeat (mid-tier price)
//   pizzeria:  2.0  — moderate repeat
//   kebabnia:  1.8  — moderate quick-service
//   bar_mleczny: 3.0  — regulars (cheap, daily lunch)
//   kawiarnia: 4.0  — coffee daily habit
//   restauracja: 1.5  — moderate dining
//   fine_dining: 1.0  — occasional special occasion
//   inne:      1.5  — default

export type RestaurantSubtype =
  | 'sushi_bar'
  | 'pizzeria'
  | 'kebabnia'
  | 'bar_mleczny'
  | 'kawiarnia'
  | 'restauracja'
  | 'fine_dining'
  | 'inne'

export const SUBTYPE_FREQUENCY: Record<RestaurantSubtype, number> = {
  sushi_bar: 2.5,
  pizzeria: 2.0,
  kebabnia: 1.8,
  bar_mleczny: 3.0,
  kawiarnia: 4.0,
  restauracja: 1.5,
  fine_dining: 1.0,
  inne: 1.5,
}

const CONVERSION_LOW = 10
const CONVERSION_MID = 15
const CONVERSION_HIGH = 25

const MIN_MONTHS_OPEN = 3
const MAX_MONTHS_OPEN = 60

export interface VolumeInput {
  client_type: 'gastronomia' | string
  client_subtype: string | null
  reviews_count: number
  rating: number
  months_since_open: number
  city: string | null
  voivodeship: string | null
  location_count: number
}

export interface VolumePrediction {
  customers_low: number
  customers_mid: number
  customers_high: number
  visits_mid: number
  monthly_reviews: number
  /** Effective subtype после fallback to 'inne'. */
  subtype_used: RestaurantSubtype
  /** Effective months used after clamping. */
  months_used: number
  formula_version: 'v1.0'
  formula_params: {
    conversion_low: number
    conversion_mid: number
    conversion_high: number
    subtype_frequency: number
    location_multiplier: number
  }
}

/** Clamp months_since_open between MIN_MONTHS_OPEN and MAX_MONTHS_OPEN.
 *  - Якщо restaurant дуже новий (<3 місяців) — use 3, бо reviews ramp slowly
 *  - Якщо старий (>60 міс) — use 60, оскільки older reviews skewed
 *    (some users delete, ranking moved, location habits change) */
function clampMonths(months: number): number {
  if (!Number.isFinite(months) || months <= 0) return MIN_MONTHS_OPEN
  if (months < MIN_MONTHS_OPEN) return MIN_MONTHS_OPEN
  if (months > MAX_MONTHS_OPEN) return MAX_MONTHS_OPEN
  return months
}

function normalizeSubtype(raw: string | null | undefined): RestaurantSubtype {
  if (!raw) return 'inne'
  const normalized = raw.toLowerCase().trim()
  if (normalized in SUBTYPE_FREQUENCY) return normalized as RestaurantSubtype
  // Soft matches — common variants
  if (normalized.includes('sushi')) return 'sushi_bar'
  if (normalized.includes('pizz')) return 'pizzeria'
  if (normalized.includes('kebab')) return 'kebabnia'
  if (normalized.includes('bar mleczn') || normalized.includes('bar_mleczn')) return 'bar_mleczny'
  if (normalized.includes('kawiarn') || normalized.includes('cafe')) return 'kawiarnia'
  if (normalized.includes('fine') || normalized.includes('michelin')) return 'fine_dining'
  if (normalized.includes('restaur')) return 'restauracja'
  return 'inne'
}

/** Public entry — calculate monthly volume prediction from review velocity. */
export function calculateMonthlyVolume(input: VolumeInput): VolumePrediction {
  const subtype = normalizeSubtype(input.client_subtype)
  const months = clampMonths(input.months_since_open)
  const reviews = Number.isFinite(input.reviews_count) ? Math.max(0, input.reviews_count) : 0
  const monthlyReviews = reviews / months

  const customers_low = Math.round(monthlyReviews * CONVERSION_LOW)
  const customers_mid = Math.round(monthlyReviews * CONVERSION_MID)
  const customers_high = Math.round(monthlyReviews * CONVERSION_HIGH)

  // Location multiplier — chain з N locations expected N× visits per location.
  // Apply на final visits, не customers (each location attracts own clientele).
  const locationMultiplier = Math.max(1, input.location_count || 1)
  const subtypeFreq = SUBTYPE_FREQUENCY[subtype]
  const visits_mid = Math.round(customers_mid * subtypeFreq * locationMultiplier)

  return {
    customers_low,
    customers_mid,
    customers_high,
    visits_mid,
    monthly_reviews: Math.round(monthlyReviews * 10) / 10,
    subtype_used: subtype,
    months_used: months,
    formula_version: 'v1.0',
    formula_params: {
      conversion_low: CONVERSION_LOW,
      conversion_mid: CONVERSION_MID,
      conversion_high: CONVERSION_HIGH,
      subtype_frequency: subtypeFreq,
      location_multiplier: locationMultiplier,
    },
  }
}

/** Helper: derive months_since_open from registration date string. */
export function calculateMonthsSinceOpen(
  registeredDate: string | Date | null | undefined,
): number {
  if (!registeredDate) return MIN_MONTHS_OPEN
  const reg = registeredDate instanceof Date ? registeredDate : new Date(registeredDate)
  if (Number.isNaN(reg.getTime())) return MIN_MONTHS_OPEN
  const now = new Date()
  const diffMs = now.getTime() - reg.getTime()
  const months = diffMs / (1000 * 60 * 60 * 24 * 30.44) // avg days per month
  return Math.max(MIN_MONTHS_OPEN, Math.round(months))
}
