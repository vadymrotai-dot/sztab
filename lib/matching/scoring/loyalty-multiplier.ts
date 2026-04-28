// lib/matching/scoring/loyalty-multiplier.ts
// Multiplier 0 / 0.5 / 1.0 — chain loyalty tier gate.
//   chain з loyalty_tier='closed' → 0 (HQ-only buyers — excluded)
//   chain з loyalty_tier='hybrid' → 0.5 (mixed central + franchisee)
//   chain з loyalty_tier='open' → 1.0
//   no chain OR loyalty_tier=null → 1.0 (neutral)

import type { MatchTarget } from '../types'

export function computeLoyaltyMultiplier(
  target: MatchTarget,
): { mult: number; reasons: string[] } {
  if (!target.chain_name) {
    return { mult: 1.0, reasons: [] }
  }

  switch (target.loyalty_tier) {
    case 'closed':
      return {
        mult: 0,
        reasons: [`sieć_zamknięta_excluded:${target.chain_name}`],
      }
    case 'hybrid':
      return {
        mult: 0.5,
        reasons: [`sieć_hybrid_×0.5:${target.chain_name}`],
      }
    case 'open':
      return {
        mult: 1.0,
        reasons: [`sieć_otwarta:${target.chain_name}`],
      }
    case null:
    default:
      // Detected chain but tier nieuwzględniony — Vadym додасть SQL коли verified
      return {
        mult: 1.0,
        reasons: [`sieć_nieuwzględniona:${target.chain_name}`],
      }
  }
}
