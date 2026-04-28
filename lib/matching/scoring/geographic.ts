// lib/matching/scoring/geographic.ts
// Subscore 0-15. Sprint F = placeholder (PL-wide neutral 10/15).
// TODO_GEO_DISTANCE: Sprint H — voivodeship vs supplier.service_zone matching.

import type { Subscore } from '../types'

export function computeGeographic(): Subscore {
  // Neutral middle-tier score — не блокує bulk run, не trywially boostuje всіх.
  return { value: 10, reasons: ['geo_pl_wide_placeholder'] }
}
