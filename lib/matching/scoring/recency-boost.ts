// lib/matching/scoring/recency-boost.ts
// Subscore 0-10. Opt-in feature flag ENABLE_RECENCY_BOOST (default true).
//   < 12 months → +10
//   < 24 months → +5
//   else → 0

import type { Subscore, MatchTarget } from '../types'

const MS_PER_MONTH = 30.4375 * 24 * 60 * 60 * 1000

export function computeRecencyBoost(target: MatchTarget): Subscore {
  const enabled = process.env.ENABLE_RECENCY_BOOST !== 'false'
  if (!enabled) return { value: 0, reasons: [] }
  if (!target.registered_date) return { value: 0, reasons: [] }

  const ts = Date.parse(target.registered_date)
  if (!Number.isFinite(ts)) return { value: 0, reasons: [] }

  const ageMonths = (Date.now() - ts) / MS_PER_MONTH
  if (ageMonths < 12) return { value: 10, reasons: ['nowa_firma_<12mc'] }
  if (ageMonths < 24) return { value: 5, reasons: ['firma_<24mc'] }
  return { value: 0, reasons: [] }
}
