// lib/intelligence-engine/types.ts
// Sprint S-CORE.1.A — Backend skeleton.
// Shared types для unified intelligence engine. Усі поля опираються на
// Strategy Shift 03.05.2026 evening (Mode B = ВСІ без VAT-фільтру; 4 entity
// types у Strategy hierarchy) + discovery v3 + Protocol 22.
//
// Real logic — S-CORE.1.B (modes implementation) і S-CORE.1.C (UI wiring).

/** Engine run mode per Sprint S-CORE.1 plan. */
export type Mode = 'A' | 'B' | 'C'

/** Top-level entities що engine вміє аналізувати. */
export type EntityType = 'client' | 'product' | 'market' | 'strategy'

/** Результат одного engine run (mode A/B/C). */
export interface RunResult {
  sources_completed: string[]
  entities_processed: number
  errors: Array<{ source: string; message: string }>
  duration_ms: number
}

/** Скоринг пари (клієнт × товар). */
export interface MatchResult {
  client_id: string
  product_id: string
  /** 0-100. */
  score: number
  /** Розкладка скору по факторах (PKD-fit, geography, size, recency, etc.). */
  score_breakdown: Record<string, number>
  /** AI re-score reasoning або null якщо не пройшло AI layer. */
  ai_reasoning: string | null
}

/** Фільтри для Mode B (registry sweep — CEIDG/KRS/GMaps/Tavily). */
export interface RegistryFilters {
  pkd?: string[]
  voivodeship?: string[]
  forma_prawna?: Array<'sp_zoo' | 'jdg' | 'sa'>
  sources?: Array<'ceidg' | 'krs' | 'gmaps' | 'tavily'>
}

/** Фільтри для Mode A (existing DB enrichment). */
export interface ExistingFilters {
  client_ids?: string[]
  updated_before?: Date
  has_contact?: boolean
}
