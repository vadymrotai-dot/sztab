// lib/ceidg/types.ts
// CEIDG API v3 types — wyłącznie z probe response (2026-04-27).
// Source: https://dane.biznes.gov.pl/api/ceidg/v3
//
// Endpoints:
//   GET /firmy?pkd=&wojewodztwo=&status=&limit=&page= — lista
//   GET /firma/{id}                                    — detail
//
// IMPORTANT: pola optional/required odzwierciedlają to co realnie
// zwrócił probe. Niektóre pola (ulic, lokal, adresKorespondencyjny)
// pojawiały się tylko w niektórych wpisach — oznaczone jako optional.

// ────────────────────────────────────────────────────────────
// Address sub-shape (adresDzialalnosci, adresKorespondencyjny)
// ────────────────────────────────────────────────────────────
export interface CeidgAddress {
  ulica?: string                  // "ul. Kamionkowska" (z prefixem ul./al./pl.)
  budynek?: string                // "1", "12G", "63"
  lokal?: string                  // "U1", "4", "1,2,3" — opcjonalne
  miasto: string                  // "Warszawa"
  wojewodztwo: string             // "MAZOWIECKIE" (UPPERCASE w response)
  powiat: string                  // "Warszawa" lub "piaseczyński"
  gmina: string                   // "Warszawa", "Praga-Południe"
  kraj: string                    // "PL"
  kod?: string                    // postal code: "03-805"
  terc?: string                   // GUS terytorialny code
  simc?: string                   // GUS system identyfikatorów
  ulic?: string                   // GUS ulic — gdy znana ulica
  // Tylko w adresKorespondencyjny:
  adresat?: string                // "Dorota Kostro-Madej"
}

// ────────────────────────────────────────────────────────────
// Owner (wlasciciel)
// ────────────────────────────────────────────────────────────
export interface CeidgOwner {
  imie: string                    // "Dorota", "PING" (czasem UPPERCASE)
  nazwisko: string                // "Kostro-Madej"
  nip?: string                    // "5321179844" — 10 cyfr
  regon?: string                  // "540501706" — 9 lub 14 cyfr
}

// ────────────────────────────────────────────────────────────
// PKD (klasyfikacja działalności)
// ────────────────────────────────────────────────────────────
export interface CeidgPkd {
  kod: string                     // "5610A" — compact, bez kropek
  nazwa: string                   // "Restauracje i inne stałe placówki gastronomiczne"
}

// ────────────────────────────────────────────────────────────
// Citizenship (obywatelstwa) — only in detail response
// ────────────────────────────────────────────────────────────
export interface CeidgCitizenship {
  symbol: string                  // "PL"
  kraj: string                    // "Polska"
}

// ────────────────────────────────────────────────────────────
// List item (z GET /firmy)
// ────────────────────────────────────────────────────────────
export interface CeidgListItem {
  id: string                      // UUID, np. "3BC33C74-C3DD-4D73-969E-3ACD11E7AAB7"
  nazwa: string                   // "Dorota Kostro-Madej Lodowa Mandala"
  adresDzialalnosci: CeidgAddress
  wlasciciel: CeidgOwner
  dataRozpoczecia: string         // ISO date "2025-03-01"
  status: CeidgStatus
  link: string                    // detail URL "https://dane.biznes.gov.pl/api/ceidg/v3/firma/{id}"
}

// CEIDG zwracane statusy. AKTYWNY potwierdzony probe-em; pozostałe
// znane z dokumentacji CEIDG. Trzymamy union open (string fallback)
// żeby nie wybuchnąć na nowych wartościach.
export type CeidgStatus =
  | 'AKTYWNY'
  | 'WYKRESLONY'
  | 'ZAWIESZONY'
  | 'WYLACZNIE_W_FORMIE_SPOLKI'
  | (string & {})

// ────────────────────────────────────────────────────────────
// Uprawnienia — koncesje/zezwolenia (rzadkie, ale ZŁOTO dla scoring:
// pole .opis często zawiera nazwę franchise/sieci, np. "Żabka Z9868").
// ────────────────────────────────────────────────────────────
export interface CeidgUprawnienie {
  dataOd?: string
  dataDo?: string
  nazwa?: string
  opis?: string
  wprowadzonePrzez?: string
}

// ────────────────────────────────────────────────────────────
// Detail (z GET /firma/{id}) — wrap w { firma: [...] } (array z 1 elementem!)
// ────────────────────────────────────────────────────────────
export interface CeidgFirmaDetails extends CeidgListItem {
  adresKorespondencyjny?: CeidgAddress
  obywatelstwa?: CeidgCitizenship[]
  rokPkd?: string                 // "2007" (rok klasyfikacji PKD)
  pkd?: CeidgPkd[]                // wszystkie kody PKD
  pkdGlowny?: CeidgPkd            // główny kod (= pierwszy z pkd zwykle)
  numerStatusu?: number           // 1 dla AKTYWNY (mapping wewnętrzny CEIDG)
  wspolnoscMajatkowa?: number     // 0/1 — wspólnota majątkowa małżeńska

  // Contact — opcjonalne, podane przez przedsiębiorcę. Probe (2026-04-27)
  // potwierdził obecność dla niektórych firm (np. ABDUL BASIT VENTURES
  // miał email + telefon). Nie ma osobnego pola www w probe — gdy CEIDG
  // doda, można rozszerzyć.
  email?: string
  telefon?: string
  adresDoreczenElektronicznych?: string  // np. "AE:PL-80532-57799-EDWWE-26"

  uprawnienia?: CeidgUprawnienie[]
}

// ────────────────────────────────────────────────────────────
// Pagination links (z list response)
// ────────────────────────────────────────────────────────────
export interface CeidgLinks {
  next?: string
  prev?: string
  self: string
  first: string
  last: string                    // używamy do parsowania &page=N → total_pages
}

// ────────────────────────────────────────────────────────────
// Response properties (metadata, identyczne dla list i detail)
// ────────────────────────────────────────────────────────────
export interface CeidgResponseProperties {
  'dc:title'?: string
  'dc:description'?: string
  'dc:language'?: string
  'schema:provider'?: string
  'schema:datePublished'?: string
}

// ────────────────────────────────────────────────────────────
// Top-level responses
// ────────────────────────────────────────────────────────────
export interface CeidgListResponse {
  firmy: CeidgListItem[]
  count: number                   // total firm matching filters (np. 8451)
  links: CeidgLinks
  properties?: CeidgResponseProperties
}

// Detail endpoint zwraca firma jako ARRAY z 1 elementem — nietypowe,
// ale tak jest w v3 response.
export interface CeidgDetailResponse {
  firma: CeidgFirmaDetails[]
  properties?: CeidgResponseProperties
}

// ────────────────────────────────────────────────────────────
// Client-side filter input (typed dla CeidgClient.listFirms)
// ────────────────────────────────────────────────────────────
export interface CeidgFilters {
  pkd?: string                    // single PKD code (compact: "5610A")
  wojewodztwo?: string            // lowercase w URL — "mazowieckie"
  status?: CeidgStatus            // "AKTYWNY"
  miasto?: string
  // CEIDG v3 wspiera dodatkowe filtry — dorzucimy w miarę potrzeb.
  // TODO: data_od, data_do, nip, regon, imie, nazwisko (probe nie pokrył).
}

// ────────────────────────────────────────────────────────────
// DB insert shape — to co server action wpisze w ceidg_prospects
// ────────────────────────────────────────────────────────────
export interface ProspectInsert {
  ceidg_id: string
  nip: string | null
  regon: string | null
  name: string
  owner_name: string | null
  status: string
  pkd_main: string | null
  pkd_all: string[] | null
  wojewodztwo: string | null
  powiat: string | null
  gmina: string | null
  miejscowosc: string | null
  kod_pocztowy: string | null
  ulica: string | null
  budynek: string | null
  lokal: string | null
  adres_full: string | null
  data_rozpoczecia: string | null
  // Contact — z detail.email/telefon (probe potwierdził, że niektóre firmy
  // mają). www nie pojawiło się w probe — zostaje NULL na razie.
  email: string | null
  telefon: string | null
  // Geo (lat/lng) pomijamy — CEIDG nie zwraca, future geocoding step.
  raw_data: unknown
  source?: string                 // default 'ceidg' w DB
}
