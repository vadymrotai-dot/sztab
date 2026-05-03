// lib/intelligence-engine/core/modes/registry-mode.ts
// Sprint S-CORE.1.B — Mode B real implementation (with TODO bulk markers).
//
// Per Strategy Shift 03.05.2026: Mode B = ВСІ entities БЕЗ VAT/wykreślona
// filter. Validation тільки на NIP/REGON формат.
//
// WRITE TARGET = ceidg_prospects (per migration 014 + 021 KRS overlay).
// CEIDG-публічна-pool, shared (no owner_id), broker-only system.
// КРИТИЧНО: НЕ пишемо у clients table — це б корумпувало customer list.
//
// Bulk paginators NOT wired у цьому sub-sprint (per scope: "NIE робити real
// API calls"). Existing per-call fetchers (lib/ceidg/client.ts CeidgClient,
// lib/rejestrio/client.ts rejestrioGet) wire-up = S-CORE.2 task.

import type { RegistryFilters, RunResult } from '../../types'

export async function runRegistryMode(
  filters?: RegistryFilters,
): Promise<RunResult> {
  const startTime = Date.now()
  const sources_completed: string[] = []
  const errors: Array<{ source: string; message: string }> = []
  const added = 0

  const sources = filters?.sources ?? ['ceidg', 'krs']

  // 1. CEIDG bulk paginator → ceidg_prospects upsert.
  if (sources.includes('ceidg')) {
    try {
      throw new Error(
        'TODO S-CORE.2: real bulk paginator. Existing fetcher: lib/ceidg/client.ts CeidgClient.fetchList. Write target: ceidg_prospects (no owner_id, shared pool). NO VAT/wykreślona check per Strategy Shift 03.05.',
      )
    } catch (e) {
      errors.push({
        source: 'ceidg',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // 2. KRS bulk filter (rejestr.io Phase 2.8).
  // Per migration 021: KRS overlay = ALTER columns на ceidg_prospects
  // (krs_number, krs_data, krs_full_name, krs_management_board, etc.) —
  // НЕ окрема таблиця. Bulk filter endpoint не wired.
  if (sources.includes('krs')) {
    try {
      throw new Error(
        'TODO S-CORE.2: rejestr.io bulk filter (Phase 2.8). Existing fetcher: lib/rejestrio/client.ts rejestrioGet. KRS overlay = ALTER columns на ceidg_prospects per migration 021. API key: params.krs_rejestr_api_token.',
      )
    } catch (e) {
      errors.push({
        source: 'krs',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // 3. Google Maps places search (Apify GMaps actor).
  if (sources.includes('gmaps')) {
    try {
      throw new Error(
        'TODO S-CORE.2: Apify GMaps actor bulk search. Existing per-call enrichment: lib/enrichment/apify.ts. API key: params.apify_api_token.',
      )
    } catch (e) {
      errors.push({
        source: 'gmaps',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // 4. Tavily web search (Phase 2.7 — discovery layer).
  if (sources.includes('tavily')) {
    try {
      throw new Error(
        'TODO S-CORE.2: Tavily bulk search. Existing per-call: lib/enrichment/web-search.ts. API key: params.tavily_key (per migration 045).',
      )
    } catch (e) {
      errors.push({
        source: 'tavily',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // Filters fields (pkd, voivodeship, forma_prawna) reserved для S-CORE.2
  // wire — paginator буде форматувати їх у CEIDG / rejestr.io params.
  void filters?.pkd
  void filters?.voivodeship
  void filters?.forma_prawna

  return {
    sources_completed,
    entities_processed: added,
    errors,
    duration_ms: Date.now() - startTime,
  }
}
