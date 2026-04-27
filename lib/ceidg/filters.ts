// lib/ceidg/filters.ts
// Phase 2.6 / Layer 1: deterministic filters dla CEIDG prospects.
// Pre-scoring gate — wykluczamy oczywiste non-fits zanim zaangażujemy
// scoring layers. Wynik jest zapisywany w ceidg_prospect_scores
// (filter_passed=false + filter_exclusion_reason; wszystkie *_score=0).

// ────────────────────────────────────────────────────────────
// PKDs istotne dla branży HoReCa (food-related). Wymagamy że co
// najmniej JEDEN z poniższych jest w pkd_all aby prospect w ogóle
// trafił do scoring. CEIDG zwraca pkd compactly ('5610A' bez kropek).
//
// Lista wynikowa po deduplikacji (Vadym pierwotnie podał 5610A 2x):
// ────────────────────────────────────────────────────────────
export const PKD_HORECA_RELEVANT = [
  '5610A',  // Restauracje i inne stałe placówki gastronomiczne
  '5610B',  // Ruchome placówki gastronomiczne
  '5621Z',  // Catering — przygotowywanie i dostarczanie żywności
  '5629Z',  // Pozostała usługowa działalność gastronomiczna
  '5630Z',  // Przygotowywanie i podawanie napojów
  '4711Z',  // Sklep z przewagą żywności/napojów/wyrobów tytoniowych
  '4725Z',  // Sklep z napojami alkoholowymi/bezalkoholowymi
  '1071Z',  // Produkcja pieczywa
  '1083Z',  // Przetwarzanie kawy/herbaty
] as const

// MVP scope: tylko mazowieckie. Easily expandable (dodaj kolejne).
// CEIDG zwraca wojewodztwo UPPERCASE; porównujemy lowercase.
export const FILTER_WHITELISTED_REGIONS = ['mazowieckie'] as const

// Maksymalna liczba PKDs po której traktujemy firmę jako
// "wide-spectrum freelancer" (np. RADEKZOOH miał 184 PKDs — zarejestrował
// całą tablicę PKD na wszelki wypadek, nie jest realnym B2B food prospect).
export const MAX_PKD_COUNT = 50

// ────────────────────────────────────────────────────────────
// ScoreableProspect — prospect shape jaki czytamy z DB (subset
// kolumn ceidg_prospects).
// ────────────────────────────────────────────────────────────
export interface ScoreableProspect {
  id: string
  status: string
  pkd_main: string | null
  pkd_all: string[] | null
  wojewodztwo: string | null
  miejscowosc: string | null
  name: string
  owner_name: string | null
  email: string | null
  telefon: string | null
  data_rozpoczecia: string | null
  raw_data: unknown
}

export type FilterReason =
  | 'inactive'
  | 'wide_spectrum_freelancer'
  | 'wrong_pkd'
  | 'wrong_region'

export interface FilterResult {
  passed: boolean
  reason?: FilterReason
}

// Lowercase whitelist set dla szybkich lookupów
const WHITELIST_LC = new Set<string>(
  FILTER_WHITELISTED_REGIONS.map((r) => r.toLowerCase()),
)

const HORECA_SET = new Set<string>(PKD_HORECA_RELEVANT)

/**
 * Apply 4 deterministic filters. Order matters — pierwsza fail-ed
 * reguła decyduje exclusion_reason.
 *
 *   1. status !== 'AKTYWNY'        → 'inactive'
 *   2. pkd_all.length > 50         → 'wide_spectrum_freelancer'
 *   3. brak HoReCa PKD w pkd_all   → 'wrong_pkd'
 *   4. wojewodztwo not in whitelist → 'wrong_region'
 */
export function applyDeterministicFilters(p: ScoreableProspect): FilterResult {
  // 1. Status
  if (p.status !== 'AKTYWNY') {
    return { passed: false, reason: 'inactive' }
  }

  // 2. Wide-spectrum freelancer
  const pkdAll = p.pkd_all ?? []
  if (pkdAll.length > MAX_PKD_COUNT) {
    return { passed: false, reason: 'wide_spectrum_freelancer' }
  }

  // 3. PKD relevance — przynajmniej 1 HoReCa PKD obecny
  const hasRelevantPkd = pkdAll.some((c) => HORECA_SET.has(c))
  if (!hasRelevantPkd) {
    return { passed: false, reason: 'wrong_pkd' }
  }

  // 4. Geographic scope (lowercase compare — CEIDG zwraca UPPERCASE)
  const woj = (p.wojewodztwo ?? '').toLowerCase()
  if (!WHITELIST_LC.has(woj)) {
    return { passed: false, reason: 'wrong_region' }
  }

  return { passed: true }
}
