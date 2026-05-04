// lib/rejestrio/search.ts
// Sprint S-CORE.2 / Phase 2.8 — bulk search wrapper навколо
// rejestr.io GET /org endpoint.
//
// Reuses generic rejestrioGet з ./client.ts (25s timeout, retry 1s/3s
// on 429/503, bare token у Authorization header).
//
// CONFIRMED shape per https://rejestr.io/api/info/wyszukiwanie-organizacji
// + empirical test 2026-05-04 ранок (test-rejestrio-search.ts output).
//
// Endpoint: GET https://rejestr.io/api/v2/org
// Auth: Authorization: <token> (bare, без 'Bearer ')
// Pagination: 1-based `strona` query param, page size `ile_na_strone`.
// Response: { liczba_wszystkich_wynikow: number, wyniki: KrsSearchOrgItem[] }
//
// Cost: ~0.05 PLN per call (search/podstawowe-dane tier).
// Rate limit: 1000 req/min (per docs).

import { rejestrioGet } from './client'

// ─── Filters (input) ────────────────────────────────────────────

export interface KrsSearchFilters {
  /** PKD główny (przeważający). Format CANONICAL з крапками: '46.39.Z'. */
  przewazajacy_pkd?: string
  /** PKD pozostały (один з drugorzędnych). Format '46.39.Z'. */
  pozostaly_pkd?: string
  /** PKD dowolny — main OR pozostały. Format '46.39.Z'. */
  dowolny_pkd?: string
  /** TERC kod 2 cyfry. e.g. '14' = mazowieckie. */
  terc_wojewodztwo?: string
  nazwa?: string
  nip?: string
  regon?: string
  forma_prawna?: string
}

// ─── Response shape (typed per real test 2026-05-04 + index sig) ─

export interface KrsSearchNazwy {
  pelna?: string
  skrocona?: string
  aktualna?: string
  [key: string]: unknown
}

export interface KrsSearchNumery {
  /** KRS у 10-digit format з leading zeros (e.g. '0001234340'). */
  krs?: string
  nip?: string | null
  regon?: string | null
  [key: string]: unknown
}

export interface KrsSearchStan {
  /** ⚠ Один з czy_ префіксом per real response. */
  czy_wykreslona?: boolean
  /** ⚠ Без czy_ prefix per real response 2026-05-04. */
  w_likwidacji?: boolean
  /** ⚠ Без czy_ prefix. */
  w_upadlosci?: boolean
  /** ⚠ Без czy_ prefix. */
  w_zawieszeniu?: boolean
  forma_prawna?: string
  /** Description (text), NOT code. e.g. "Handel hurtowy...". */
  pkd_przewazajace_dzial?: string
  [key: string]: unknown
}

export interface KrsSearchTeryt {
  /** TERC code 2 cyfry, e.g. '14' = mazowieckie. */
  wojewodztwo?: string
  /** TERC code 4 cyfry. */
  powiat?: string
  /** TERC code 6 cyfr. */
  gmina?: string
  [key: string]: unknown
}

export interface KrsSearchAdres {
  miejscowosc?: string
  /** ⚠ Постал code field name = 'kod' (NOT 'kod_pocztowy'). */
  kod?: string
  ulica?: string
  nr_domu?: string
  panstwo?: string
  /** Nested teryt object — replaces flat terc_wojewodztwo. */
  teryt?: KrsSearchTeryt
  [key: string]: unknown
}

export interface KrsSearchKontakt {
  /** Array email-ів від KRS. Available на Biznes plan. */
  emaile?: string[]
  /** Tolerantне на майбутнє — поки не у sample, але можливо для інших firm. */
  telefony?: string[]
  [key: string]: unknown
}

export interface KrsSearchGlownaOsoba {
  id?: string
  /** Full name "Imię Nazwisko" — prezes zarządu / chairman / owner. */
  imiona_i_nazwisko?: string
  [key: string]: unknown
}

/**
 * Opaque object — fields що ми поки не deeply mapped (sprawozdanie,
 * krs_rejestry, krs_wpisy, krs_powiazania_liczby, metadane).
 */
export type KrsSearchOpaqueObject = Record<string, unknown>

export interface KrsSearchOrgItem {
  /** KRS without leading zeros (integer). Use org.numery.krs для padded. */
  id: number
  nazwy?: KrsSearchNazwy
  numery?: KrsSearchNumery
  stan?: KrsSearchStan
  /** Decision-maker info (prezes / chairman / owner). */
  glowna_osoba?: KrsSearchGlownaOsoba
  adres?: KrsSearchAdres
  /** Available на Biznes plan (per real test 2026-05-04 — Sztab account має). */
  kontakt?: KrsSearchKontakt
  ostatnie_sprawozdanie?: KrsSearchOpaqueObject
  krs_rejestry?: KrsSearchOpaqueObject
  krs_wpisy?: KrsSearchOpaqueObject
  krs_powiazania_liczby?: KrsSearchOpaqueObject
  metadane?: KrsSearchOpaqueObject
  typ?: 'organizacja' | string
  [key: string]: unknown
}

export interface KrsSearchResponse {
  liczba_wszystkich_wynikow: number
  wyniki: KrsSearchOrgItem[]
  [key: string]: unknown
}

// ─── Default base path ──────────────────────────────────────────

export const DEFAULT_SEARCH_BASE_PATH = '/org'

// ─── Public API ─────────────────────────────────────────────────

/**
 * Bulk filter search через rejestr.io GET /org endpoint.
 *
 * @param apiKey   — rejestr.io API token (params.krs_rejestr_api_token)
 * @param filters  — search criteria (przewazajacy_pkd / terc_wojewodztwo / etc.)
 * @param page     — 0-based page index (внутрішня convention; URL converted
 *                    to 1-based `strona` per API)
 * @param limit    — page size; внутрішня convention. URL = `ile_na_strone`.
 *                    Recommended 50-100 для ефективного bulk.
 * @param basePath — endpoint path відносно REJESTR_BASE. Default '/org'.
 *                    Override якщо у майбутньому API path зміниться.
 */
export async function searchOrganizations(
  apiKey: string,
  filters: KrsSearchFilters,
  page = 0,
  limit = 50,
  basePath: string = DEFAULT_SEARCH_BASE_PATH,
): Promise<KrsSearchResponse> {
  const params = new URLSearchParams()
  if (filters.przewazajacy_pkd) params.set('przewazajacy_pkd', filters.przewazajacy_pkd)
  if (filters.pozostaly_pkd) params.set('pozostaly_pkd', filters.pozostaly_pkd)
  if (filters.dowolny_pkd) params.set('dowolny_pkd', filters.dowolny_pkd)
  if (filters.terc_wojewodztwo) params.set('terc_wojewodztwo', filters.terc_wojewodztwo)
  if (filters.nazwa) params.set('nazwa', filters.nazwa)
  if (filters.nip) params.set('nip', filters.nip)
  if (filters.regon) params.set('regon', filters.regon)
  if (filters.forma_prawna) params.set('forma_prawna', filters.forma_prawna)
  // 0-based page input → 1-based strona URL param.
  params.set('strona', String(page + 1))
  params.set('ile_na_strone', String(limit))

  const pathSuffix = `${basePath}?${params.toString()}`
  return rejestrioGet<KrsSearchResponse>(apiKey, pathSuffix)
}

/**
 * Async generator over всі pages для зазначених filters. Streams page-by-page
 * без bufферування у пам'ять. Yields `{ page, total, orgs }` per page.
 *
 * Computes totalPages defensively через
 *   Math.max(1, Math.ceil(liczba_wszystkich_wynikow / limit)).
 * Якщо response не містить `liczba_wszystkich_wynikow` — treats response
 * як single page (loop breaks after first iteration).
 */
export async function* paginateSearch(
  apiKey: string,
  filters: KrsSearchFilters,
  limit = 50,
  basePath: string = DEFAULT_SEARCH_BASE_PATH,
): AsyncGenerator<{ page: number; total: number; orgs: KrsSearchOrgItem[] }> {
  let page = 0
  while (true) {
    const res = await searchOrganizations(apiKey, filters, page, limit, basePath)
    const total = Number(res.liczba_wszystkich_wynikow ?? res.wyniki?.length ?? 0)
    yield {
      page,
      total,
      orgs: res.wyniki ?? [],
    }
    const totalPages = Math.max(1, Math.ceil(total / limit))
    if (page + 1 >= totalPages) break
    page += 1
  }
}
