// lib/matching/scoring/aggregate.ts
// Orchestrator: збирає subscores → MatchResult.
//
// Order:
//   1. Hygiene gate (0/1) — short-circuit return 0 if fail
//   2. Loyalty multiplier (0/0.5/1) — short-circuit return 0 if fail
//   3. PKD-fit (0-40) — pick 2025 codes, fallback 2007 коли empty
//   4. Activity status (0-10)
//   5. Size match (0-20)
//   6. Geographic (0-15, currently 10 placeholder)
//   7. Recency boost (0-10, env-flag)
//   8. Σ × loyalty.mult, clamp [0, 100], round
//
// reason_codes accumulated від всіх subscores у display order.

import type {
  MatchTarget,
  MatchProduct,
  MatchFamily,
  MatchResult,
} from '../types'
import { computeHygieneGate } from './hygiene-gate'
import { computeLoyaltyMultiplier } from './loyalty-multiplier'
import { computePkdFit } from './pkd-fit'
import { computeActivityStatus } from './activity-status'
import { computeSizeMatch } from './size-match'
import { computeGeographic } from './geographic'
import { computeRecencyBoost } from './recency-boost'

// Sprint L Phase 4 — food families that benefit from AI niche bonus
// when business buyer_strength_for_chm is high. ChM = Czudowa Marka
// kiszonki/sałatki/marynaty/buraki — relevant до Polish food retail,
// gastronomia, ukraińska/słowiańska sieć sklepów.
const CHM_RELEVANT_FAMILIES = [
  'Kiszonki',
  'Sałatki gotowe',
  'Marynaty',
  'Buraki / Warzywa konserwowane',
  'Warzywa konserwowane',
  'Sałatki',
]

function nicheBonus(
  target: MatchTarget,
  family: MatchFamily,
): { value: number; reasons: string[] } {
  const strength = target.business_profile?.buyer_strength_for_chm ?? null
  if (strength === null || strength === undefined) return { value: 0, reasons: [] }
  // Family name match (case-insensitive)
  const familyName = (family.name_pl ?? '').toLowerCase()
  const isFoodFamily = CHM_RELEVANT_FAMILIES.some((f) => familyName.includes(f.toLowerCase()))
  if (!isFoodFamily) return { value: 0, reasons: [] }

  if (strength >= 70) {
    return {
      value: 25,
      reasons: [`niche_bonus_high:strength=${strength},family=${family.name_pl}`],
    }
  }
  if (strength >= 40) {
    return {
      value: 10,
      reasons: [`niche_bonus_mid:strength=${strength},family=${family.name_pl}`],
    }
  }
  return { value: 0, reasons: [] }
}

export function aggregateMatch(
  target: MatchTarget,
  product: MatchProduct,
  family: MatchFamily,
): MatchResult {
  const ZERO_BREAKDOWN = { pkd: 0, activity: 0, size: 0, geo: 0, recency: 0, niche_bonus: 0 }

  // 1. Hygiene gate — short-circuit
  const hyg = computeHygieneGate(target, product)
  if (!hyg.pass) {
    return {
      algo_score: 0,
      subscore_breakdown: ZERO_BREAKDOWN,
      hygiene_pass: false,
      loyalty_multiplier: 1.0,
      reason_codes: hyg.reasons,
    }
  }

  // 2. Loyalty multiplier
  const loyalty = computeLoyaltyMultiplier(target)
  if (loyalty.mult === 0) {
    return {
      algo_score: 0,
      subscore_breakdown: ZERO_BREAKDOWN,
      hygiene_pass: true,
      loyalty_multiplier: 0,
      reason_codes: loyalty.reasons,
    }
  }

  // 3. PKD-fit — pick 2025 codes, fallback 2007 коли empty
  const has2025 = (target.pkd_2025_codes?.length ?? 0) > 0
  const tCodes = has2025
    ? (target.pkd_2025_codes as string[])
    : (target.pkd_2007_codes ?? [])
  const fTargets = has2025 ? family.target_pkd_2025 : family.target_pkd_2007
  const pkd = computePkdFit(tCodes, fTargets)

  // 4-7. Other subscores
  const activity = computeActivityStatus(target)
  const size = computeSizeMatch(target, product)
  const geo = computeGeographic()
  const recency = computeRecencyBoost(target)

  // 7.5 Sprint L Phase 4 — AI niche bonus
  const niche = nicheBonus(target, family)

  // 8. Aggregate
  const subTotal =
    pkd.value + activity.value + size.value + geo.value + recency.value + niche.value
  const finalScore = Math.max(
    0,
    Math.min(100, Math.round(subTotal * loyalty.mult)),
  )

  const reason_codes: string[] = [
    ...pkd.reasons,
    ...activity.reasons,
    ...size.reasons,
    ...geo.reasons,
    ...recency.reasons,
    ...niche.reasons,
    ...loyalty.reasons,
  ]

  return {
    algo_score: finalScore,
    subscore_breakdown: {
      pkd: pkd.value,
      activity: activity.value,
      size: size.value,
      geo: geo.value,
      recency: recency.value,
      niche_bonus: niche.value,
    },
    hygiene_pass: true,
    loyalty_multiplier: loyalty.mult,
    reason_codes,
  }
}
