// lib/enrichment/msig.ts
// Sprint K / Phase 2C — Monitor Sądowy i Gospodarczy scraper.
//
// Source: imsig.pl text search by KRS or NIP. Site requires HTML scraping —
// no public JSON API. rejestr.io API also exposes /msig endpoint (preferred
// when token present).
//
// Status: PARTIAL — uses rejestr.io endpoint якщо available; otherwise
// returns empty з documented TODO. Full HTML scraping імsig.pl deferred
// до Sprint L якщо потрібно (requires careful selector maintenance).

const REJESTR_BASE = 'https://rejestr.io/api/v1'
const REQUEST_TIMEOUT_MS = 30_000

export interface MsigChange {
  msig_number: string | null
  publication_date: string | null
  change_type: string | null // 'zarząd' / 'kapitał' / 'adres' / 'forma' / etc.
  description: string | null
  raw: unknown
}

interface RejestrMsigEntry {
  numer?: string
  data?: string
  rodzaj_zmiany?: string
  opis?: string
}

interface RejestrMsigResponse {
  results?: RejestrMsigEntry[]
}

function parseChangeType(opis: string): string | null {
  const o = opis.toLowerCase()
  if (o.includes('zarząd') || o.includes('prezes') || o.includes('członek')) return 'zarząd'
  if (o.includes('kapitał') || o.includes('podwyższenie') || o.includes('obniżenie'))
    return 'kapitał'
  if (o.includes('adres') || o.includes('siedziba')) return 'adres'
  if (o.includes('forma prawna') || o.includes('przekształcenie')) return 'forma'
  if (o.includes('rada nadzorcza')) return 'rada nadzorcza'
  if (o.includes('prokurent') || o.includes('prokura')) return 'prokura'
  return null
}

/** Fetch MSiG changes for a KRS number via rejestr.io. */
export async function fetchMsigChanges(
  apiKey: string,
  krsNumber: string,
): Promise<MsigChange[]> {
  if (!apiKey) {
    console.warn('[msig] rejestr.io token missing — returning empty')
    return []
  }
  if (!krsNumber || !/^\d{1,10}$/.test(krsNumber)) return []
  const padded = krsNumber.padStart(10, '0')

  const url = `${REJESTR_BASE}/krs/${padded}/msig`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Token ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    console.error('[msig] network error:', err instanceof Error ? err.message : err)
    return []
  }

  if (res.status === 404) return []
  if (!res.ok) {
    console.error(`[msig] HTTP ${res.status}`)
    return []
  }

  const data = (await res.json()) as RejestrMsigResponse
  const items = data.results ?? []
  return items.map((r) => ({
    msig_number: r.numer ?? null,
    publication_date: r.data ?? null,
    change_type: r.rodzaj_zmiany ?? (r.opis ? parseChangeType(r.opis) : null),
    description: r.opis ?? null,
    raw: r,
  }))
}
