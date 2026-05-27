// lib/orders/tier-config.ts
// Sprint S-CENNIK-WH.2 (26.05.2026) — central constants для cennik matrix 2x2.
//
// Matrix (cennik_tier × price_mode):
//   standard + auto    → calcTier() iterate maly/sredni/duzy (2k/4k thresholds)
//   standard + minimum → locked price_duzy (najnizsza standard cena)
//   wielki_hurt + auto → 10k threshold: <10k Hurt (price_hurt_wh), >=10k Wielki Hurt (price_duzi_gracze)
//   wielki_hurt + min  → locked price_duzi_gracze (z S-CENNIK-WH.1)
//
// tier_at_submit final values (TEXT free-form, no enum constraint):
//   'maly' | 'sredni' | 'duzy' (standard auto)
//   'duzy' (standard minimum — locked duzy)
//   'wielki_hurt_entry' (WH auto < 10k)
//   'wielki_hurt' (WH auto >= 10k OR WH minimum locked)

export const WH_HURT_THRESHOLD = 10000 // PLN netto — wielki_hurt + auto split

export const STANDARD_TIERS = {
  maly: { max: 2000, priceKey: 'price_maly_opt' as const },
  sredni: { max: 4000, priceKey: 'price_sredni' as const },
  duzy: { max: Infinity, priceKey: 'price_duzy' as const },
} as const

export type CennikTier = 'standard' | 'wielki_hurt'
export type PriceMode = 'auto' | 'minimum'
export type StandardTier = 'maly' | 'sredni' | 'duzy'
export type TierAtSubmit = StandardTier | 'wielki_hurt' | 'wielki_hurt_entry'

export type ProductPriceKey =
  | 'price_maly_opt'
  | 'price_sredni'
  | 'price_duzy'
  | 'price_duzi_gracze'
  | 'price_hurt_wh'
