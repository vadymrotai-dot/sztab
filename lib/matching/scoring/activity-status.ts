// lib/matching/scoring/activity-status.ts
// Subscore 0-10. VAT czynny + GUS active = full points.

import type { Subscore, MatchTarget } from '../types'

export function computeActivityStatus(target: MatchTarget): Subscore {
  let score = 0
  const reasons: string[] = []

  if (target.vat_status?.toLowerCase() === 'czynny') {
    score += 5
    reasons.push('aktywny_vat')
  }
  if (target.gus_status?.toLowerCase() === 'active') {
    score += 5
    reasons.push('aktywny_gus')
  }

  if (score === 0) reasons.push('status_nieznany')
  return { value: score, reasons }
}
