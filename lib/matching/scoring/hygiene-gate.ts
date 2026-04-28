// lib/matching/scoring/hygiene-gate.ts
// Multiplier 0/1 — hard gate.
//   product.hygiene_status='DIRTY' → 0 (excluded)
//   target missing required fields (name OR nip) → 0
//   else → 1

import type { MatchTarget, MatchProduct } from '../types'

export function computeHygieneGate(
  target: MatchTarget,
  product: MatchProduct,
): { pass: boolean; reasons: string[] } {
  const reasons: string[] = []

  if (product.hygiene_status === 'DIRTY') {
    reasons.push('produkt_dirty_excluded')
    return { pass: false, reasons }
  }

  if (!target.name || target.name.trim() === '') {
    reasons.push('klient_brak_nazwy')
    return { pass: false, reasons }
  }

  return { pass: true, reasons: [] }
}
