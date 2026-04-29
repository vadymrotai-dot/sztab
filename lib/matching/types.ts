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

export interface MatchResult {
  algo_score: number
  subscore_breakdown: SubscoreBreakdown
  hygiene_pass: boolean
  loyalty_multiplier: number
  reason_codes: string[]
}
