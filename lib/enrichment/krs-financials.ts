// lib/enrichment/krs-financials.ts
// Sprint L Phase 1A — rejestr.io v2 migration.
//
// v1 deprecated (HTTP 410 "API v1 zostało wyłączone").
// v2 paths discovered via openapi.json:
//   GET /api/v2/org?nip={nip} OR ?krs={krs} → list матches (organization
//                                              IDs needed для подальших lookups)
//   GET /api/v2/org/{id}/krs-sprawozdania → financial reports
//   GET /api/v2/org/{id}/krs-powiazania   → board members + connections
//
// Authorization: pass token у `Authorization` header (no "Token "/"Bearer "
// prefix — empirical, як у v1).
//
// NOTE: rejestr.io account може not have credit (`konto/stan` returns "0.00000")
// → all calls return HTTP 403 {kod:403,info:"Brak kredytu API"}.
// Top up at https://rejestr.io/konto/api щоб activate.

const REJESTR_BASE = 'https://rejestr.io/api/v2'
const REQUEST_TIMEOUT_MS = 30_000

export interface YearlyFinancials {
  rok: number
  przychody_pln: number | null
  zysk_netto_pln: number | null
  marza_netto: number | null
  aktywa_pln: number | null
  kapital_wlasny_pln: number | null
  zatrudnienie: number | null
  source_url: string | null
  filed_at: string | null
  raw: unknown
}

interface OrgMatch {
  id: number | string
  nazwa?: string
  krs?: string
  nip?: string
  regon?: string
}

interface OrgListResponse {
  results?: OrgMatch[]
  count?: number
}

interface RejestrSprawozdanie {
  rok?: number
  data_zlozenia?: string
  url?: string
  bilans?: {
    suma_aktywow?: number
    kapital_wlasny?: number
  }
  rachunek_zyskow?: {
    przychody?: number
    przychody_netto_ze_sprzedazy?: number
    zysk_netto?: number
  }
  sprawozdanie_z_dzialalnosci?: {
    przeciętne_zatrudnienie?: number
  }
}

interface RejestrSprawozdaniaResponse {
  results?: RejestrSprawozdanie[]
  count?: number
}

async function rejestrFetch(apiKey: string, path: string): Promise<Response> {
  const url = `${REJESTR_BASE}${path}`
  return fetch(url, {
    method: 'GET',
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Sztab/1.0; +mailto:vadymrotai@gmail.com)',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

/** Resolve rejestr.io internal org id from NIP or KRS number. */
export async function resolveOrgIdByNip(
  apiKey: string,
  nip: string,
): Promise<string | null> {
  const cleanNip = nip.replace(/\D/g, '')
  if (cleanNip.length !== 10) return null
  const res = await rejestrFetch(apiKey, `/org?nip=${cleanNip}`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`rejestr.io /org HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as OrgListResponse
  const first = data.results?.[0]
  return first ? String(first.id) : null
}

export async function resolveOrgIdByKrs(
  apiKey: string,
  krsNumber: string,
): Promise<string | null> {
  const padded = krsNumber.padStart(10, '0')
  if (!/^\d{10}$/.test(padded)) return null
  const res = await rejestrFetch(apiKey, `/org?krs=${padded}`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`rejestr.io /org HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as OrgListResponse
  const first = data.results?.[0]
  return first ? String(first.id) : null
}

/** Fetch sprawozdania finansowe via rejestr.io v2.
 *  Resolves org id via NIP/KRS first, then fetches /krs-sprawozdania. */
export async function fetchSprawozdania(
  apiKey: string,
  identifier: { nip?: string; krs?: string },
): Promise<YearlyFinancials[]> {
  if (!apiKey) throw new Error('KRS_REJESTR_API_TOKEN missing')

  // Resolve org id
  let orgId: string | null = null
  if (identifier.krs) orgId = await resolveOrgIdByKrs(apiKey, identifier.krs)
  if (!orgId && identifier.nip) orgId = await resolveOrgIdByNip(apiKey, identifier.nip)
  if (!orgId) return []

  const res = await rejestrFetch(apiKey, `/org/${orgId}/krs-sprawozdania`)
  if (res.status === 404) return []
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`rejestr.io sprawozdania HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as RejestrSprawozdaniaResponse
  const items = data.results ?? []
  return items.map(parseSprawozdanie).slice(0, 5)
}

function parseSprawozdanie(raw: RejestrSprawozdanie): YearlyFinancials {
  const przychody =
    raw.rachunek_zyskow?.przychody_netto_ze_sprzedazy ??
    raw.rachunek_zyskow?.przychody ??
    null
  const zysk = raw.rachunek_zyskow?.zysk_netto ?? null
  const marza =
    przychody && zysk && przychody > 0
      ? Math.round((zysk / przychody) * 10000) / 100
      : null

  return {
    rok: raw.rok ?? new Date().getFullYear() - 1,
    przychody_pln: przychody,
    zysk_netto_pln: zysk,
    marza_netto: marza,
    aktywa_pln: raw.bilans?.suma_aktywow ?? null,
    kapital_wlasny_pln: raw.bilans?.kapital_wlasny ?? null,
    zatrudnienie: raw.sprawozdanie_z_dzialalnosci?.przeciętne_zatrudnienie ?? null,
    source_url: raw.url ?? null,
    filed_at: raw.data_zlozenia ?? null,
    raw,
  }
}
