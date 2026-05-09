// lib/matching/scoring/s2a-signals.ts
// Sprint S2A Phase 3 — penalties + bonuses derived з rejestr.io v2 +
// financial_statements + crbr_beneficiaries signals.

import type { MatchTarget } from '../types'

export interface S2APenalties {
  bankruptcy: number
  liquidation: number
  restructuring: number
  suspended: number
  stale_filing: number
}

export interface S2ABonuses {
  revenue: number
  branches: number
  bo_pl: number
  pkd_pivot: number
  /** Phase B (10.05.2026) — UA founder boost +10 коли target.s2a_signals
   *  має ua_founder_detected=true (read from ua_founders_signal->>detected). */
  ua_founder_boost: number
}

export interface S2AResult {
  penalties: S2APenalties
  bonuses: S2ABonuses
  reasons: string[]
}

const STALE_FILING_DAYS = 730 // ~24 months

export function computeS2ASignals(target: MatchTarget): S2AResult {
  const sig = target.s2a_signals ?? {}
  const reasons: string[] = []
  const penalties: S2APenalties = {
    bankruptcy: 0,
    liquidation: 0,
    restructuring: 0,
    suspended: 0,
    stale_filing: 0,
  }
  const bonuses: S2ABonuses = {
    revenue: 0,
    branches: 0,
    bo_pl: 0,
    pkd_pivot: 0,
    ua_founder_boost: 0,
  }

  // Penalties
  if (sig.bankruptcy_flag) {
    penalties.bankruptcy = -100
    reasons.push('-100 bankruptcy')
  }
  if (sig.liquidation_flag) {
    penalties.liquidation = -100
    reasons.push('-100 liquidation')
  }
  if (sig.restructuring_flag) {
    penalties.restructuring = -25
    reasons.push('-25 restructuring')
  }
  if (sig.suspended_at) {
    penalties.suspended = -50
    reasons.push('-50 suspended')
  }
  if (sig.last_filing_date) {
    const daysAgo = (Date.now() - new Date(sig.last_filing_date).getTime()) / 86_400_000
    if (daysAgo > STALE_FILING_DAYS) {
      penalties.stale_filing = -15
      reasons.push(`-15 stale_filing (${Math.round(daysAgo)}d)`)
    }
  }

  // Bonuses
  const rev = sig.latest_revenue_pln ?? null
  if (rev !== null && rev > 5_000_000) {
    bonuses.revenue = 15
    reasons.push('+15 revenue>5M')
  } else if (rev !== null && rev > 1_000_000) {
    bonuses.revenue = 10
    reasons.push('+10 revenue>1M')
  }

  const branchCount = sig.branch_offices_count ?? 0
  if (branchCount > 3) {
    bonuses.branches = 20
    reasons.push(`+20 branches=${branchCount}`)
  } else if (branchCount > 0) {
    bonuses.branches = 10
    reasons.push(`+10 branches=${branchCount}`)
  }

  if (sig.has_bo_pl) {
    bonuses.bo_pl = 5
    reasons.push('+5 BO PL resident')
  }

  if (sig.pkd_changed_recently) {
    bonuses.pkd_pivot = 5
    reasons.push('+5 pkd pivot last 6mo')
  }

  // Phase B (10.05.2026) — UA founder boost. detected=true тільки для
  // verified (CRBR-confirmed UA citizenship/residency) + high (UK first +
  // UK surname без PL signal) per Phase A Q5. Transparent у bonuses JSONB
  // (subscore_breakdown) + reason_codes — AI rescore reads context.
  if (sig.ua_founder_detected) {
    bonuses.ua_founder_boost = 10
    reasons.push('+10 ua_founder_match')
  }

  return { penalties, bonuses, reasons }
}
