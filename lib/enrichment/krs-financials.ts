// lib/enrichment/krs-financials.ts
// Sprint K / Phase 2B — sprawozdania finansowe з rejestr.io.
//
// rejestr.io has KRS_REJESTR_API_TOKEN у .env.local (paid subscription).
// API: https://rejestr.io/api/v1/krs/{krs_number}/sprawozdania
// Returns ostatni 3-5 років sprawozdań finansowych w JSON.
//
// Public ekrs.ms.gov.pl/rdf/rd/ requires PDF parsing (pdf-parse) — fallback.
// Цей module використовує rejestr.io тільки.

const REJESTR_BASE = 'https://rejestr.io/api/v1'
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

/** Fetch sprawozdania finansowe для KRS number via rejestr.io. */
export async function fetchSprawozdania(
  apiKey: string,
  krsNumber: string,
): Promise<YearlyFinancials[]> {
  if (!apiKey) throw new Error('KRS_REJESTR_API_TOKEN missing')
  if (!krsNumber || !/^\d{1,10}$/.test(krsNumber)) {
    throw new Error(`invalid KRS number: ${krsNumber}`)
  }
  // KRS у rejestr.io is zero-padded 10 digits
  const padded = krsNumber.padStart(10, '0')

  const url = `${REJESTR_BASE}/krs/${padded}/sprawozdania`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Token ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(`rejestr.io network: ${err instanceof Error ? err.message : err}`)
  }

  if (res.status === 404) return [] // KRS не has sprawozdania — empty result OK
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`rejestr.io HTTP ${res.status}: ${body.slice(0, 200)}`)
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
