// lib/matching/types.ts
// Shared types для L5 matching engine. One file, central — kept thin
// (just shapes; logic lives в scoring modules).

export type TargetType = 'client' | 'prospect'

/** Common matching target — derived із clients OR ceidg_prospects rows.
 *  All fields nullable (data quality varies); scoring modules handle gracefully. */
export interface MatchTarget {
  type: TargetType
  id: string
  name: string
  /** "Compact" PKD codes (no dots, e.g. "4725Z") OR dotted ("47.25.Z").
   *  scoring/pkd-fit normalizes на input. */
  pkd_2025_codes: string[] | null
  pkd_2007_codes: string[] | null
  vat_status: string | null
  gus_status: string | null
  registered_date: string | null
  legal_form: string | null
  /** Optional: KRS management board size (count of members). Used dla size-derive. */
  board_size: number | null
  voivodeship: string | null
  /** Optional: chain detection (e.g. "Żabka", "Lewiatan"). Null = standalone. */
  chain_name: string | null
  /** Loyalty tier для chain — set вручну Vadym SQL коли verified. */
  loyalty_tier: 'closed' | 'hybrid' | 'open' | null
  /** Sprint L Phase 4 — AI business analysis output (Claude Haiku).
   *  buyer_strength_for_chm drives niche bonus у aggregateMatch. */
  business_profile?: {
    business_format?: string
    buyer_strength_for_chm?: number
    special_traits_pl?: string[]
  } | null
  /** Sprint S2A Phase 3 — red flags + bonuses signals (z rejestr.io v2 +
   *  financial_statements + crbr_beneficiaries). */
  s2a_signals?: {
    bankruptcy_flag?: boolean
    liquidation_flag?: boolean
    restructuring_flag?: boolean
    suspended_at?: string | null
    branch_offices_count?: number
    last_filing_date?: string | null
    latest_revenue_pln?: number | null
    has_bo_pl?: boolean
    pkd_changed_recently?: boolean
  } | null
}

export interface MatchProduct {
  id: string
  name: string
  family_id: string
  brand: string | null
  hygiene_status: 'CLEAN' | 'DIRTY' | 'UNCHECKED' | null
  price_tier: 'budget' | 'mid' | 'premium' | null
}

export interface MatchFamily {
  id: string
  name_pl: string
  target_pkd_2025: string[]
  target_pkd_2007: string[]
}

export interface Subscore {
  value: number
  reasons: string[]
}

export interface SubscoreBreakdown {
  pkd: number
  activity: number
  size: number
  geo: number
  recency: number
  /** Sprint L Phase 4 — AI-driven niche bonus для food families when
   *  business_profile.buyer_strength_for_chm is high. */
  niche_bonus?: number
}

/** Sprint S2A Phase 3 — rich score breakdown stored у matches.score_breakdown
 *  JSONB. Captures penalties/bonuses applied beyond legacy subscore_breakdown. */
export interface ScoreBreakdownS2A {
  total: number
  base: { pkd: number; activity: number; size: number; geo: number; recency: number; niche: number }
  penalties: {
    bankruptcy: number
    liquidation: number
    restructuring: number
    suspended: number
    stale_filing: number
  }
  bonuses: {
    revenue: number
    branches: number
    bo_pl: number
    pkd_pivot: number
  }
  reasons: string[]
}

export interface MatchResult {
  algo_score: number
  subscore_breakdown: SubscoreBreakdown
  /** Sprint S2A Phase 3 — rich breakdown {base, penalties, bonuses, reasons[]} */
  score_breakdown: ScoreBreakdownS2A
  hygiene_pass: boolean
  loyalty_multiplier: number
  reason_codes: string[]
}
