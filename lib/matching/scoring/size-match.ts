// lib/matching/scoring/size-match.ts
// Subscore 0-20. Match table:
//   large↔premium=20, medium↔mid=20, small↔budget=20
//   adjacent (e.g. medium↔budget, large↔mid) = 12
//   opposite (large↔budget, small↔premium) = 4
//   unknown side = 10 (neutral)

import type { Subscore, MatchTarget, MatchProduct } from '../types'

type Size = 'large' | 'medium' | 'small' | 'unknown'
type Tier = 'budget' | 'mid' | 'premium' | 'unknown'

/** Heuristic: legal form + KRS board size (when present) → company size. */
export function deriveSize(target: MatchTarget): Size {
  const lf = (target.legal_form ?? '').toLowerCase()
  const board = target.board_size ?? 0

  // S.A. з 5+ board members = clearly large
  if ((lf.includes('s.a.') || lf.includes('akcyjna')) && board >= 5) {
    return 'large'
  }
  // Plain SA з smaller board → medium
  if (lf.includes('s.a.') || lf.includes('akcyjna')) {
    return 'medium'
  }
  // Sp. z o.o. → medium (common Polish SME structure)
  if (lf.includes('z o.o.') || lf.includes('z ograniczoną')) {
    return 'medium'
  }
  // CEIDG / JDG → small
  if (lf.includes('jdg') || lf.includes('działalność gospodarcza')) {
    return 'small'
  }
  // Prospects on CEIDG default to small (CEIDG = JDG only)
  if (target.type === 'prospect') return 'small'
  return 'unknown'
}

const MATRIX: Record<Size, Record<Tier, number>> = {
  large: { premium: 20, mid: 12, budget: 4, unknown: 10 },
  medium: { premium: 12, mid: 20, budget: 12, unknown: 10 },
  small: { premium: 4, mid: 12, budget: 20, unknown: 10 },
  unknown: { premium: 10, mid: 10, budget: 10, unknown: 10 },
}

export function computeSizeMatch(
  target: MatchTarget,
  product: MatchProduct,
): Subscore {
  const size = deriveSize(target)
  const tier: Tier = product.price_tier ?? 'unknown'
  const score = MATRIX[size][tier]

  const reasons: string[] = []
  const matchPairs: [Size, Tier][] = [
    ['large', 'premium'],
    ['medium', 'mid'],
    ['small', 'budget'],
  ]
  const isExactMatch = matchPairs.some(([s, t]) => s === size && t === tier)
  if (isExactMatch) {
    reasons.push(`rozmiar_dopasowany:${size}↔${tier}`)
  } else if (size === 'unknown' || tier === 'unknown') {
    reasons.push(`rozmiar_neutralny:${size}↔${tier}`)
  } else {
    reasons.push(`rozmiar_częściowy:${size}↔${tier}`)
  }

  return { value: score, reasons }
}
