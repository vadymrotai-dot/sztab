// lib/enrichment/krs.ts
// KRS Open API (Ministerstwo Sprawiedliwości) — public, no auth.
//
// Endpoint: GET https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/{KRS}
//   ?rejestr={P|S}&format=json
//
// Rejestr:
//   P = Przedsiębiorców (companies — sp. z o.o., S.A., etc)
//   S = Stowarzyszeń, Fundacji, ZOZ
//
// Throttle: 1 req/s polite default (no published limit).
// Maintenance windows: API has periodic 503 — retry з backoff.
// Anonymization: imię/nazwisko/PESEL anonymized per RODO (board members
// shown jako "Członek 1, 2, 3").

const KRS_BASE = 'https://api-krs.ms.gov.pl'
const KRS_TIMEOUT_MS = 10_000
const KRS_RETRY_DELAYS_MS = [5_000, 10_000] as const
const KRS_THROTTLE_MS = 1_000

let lastCallAt = 0
async function throttle(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastCallAt
  if (elapsed < KRS_THROTTLE_MS) {
    await new Promise((r) => setTimeout(r, KRS_THROTTLE_MS - elapsed))
  }
  lastCallAt = Date.now()
}

// ────────────────────────────────────────────────────────────
// Raw KRS response shape (partial — focused on fields we extract)
// ────────────────────────────────────────────────────────────

export interface KrsRawResponse {
  odpis?: {
    rodzaj?: string
    naglowekA?: {
      rejestr?: string
      numerKRS?: string
      dataRejestracji?: string
      dataOstatniegoWpisu?: string
      stanPozycji?: string
    }
    dane?: {
      dzial1?: {
        danePodmiotu?: {
          nazwa?: string
          formaPrawna?: string
          identyfikatory?: { nip?: string; regon?: string }
        }
        siedzibaIAdres?: {
          adres?: {
            ulica?: string
            nrDomu?: string
            nrLokalu?: string
            miejscowosc?: string
            kodPocztowy?: string
            kraj?: string
          }
        }
        kapital?: {
          wysokoscKapitaluZakladowego?: { wartosc?: string; waluta?: string }
        }
      }
      dzial2?: {
        reprezentacja?: { sposobReprezentacji?: string }
        organReprezentacji?: Array<{
          nazwa?: string
          skladOrganu?: Array<{
            nazwisko?: { nazwiskoICzlon?: string; pierwszeImie?: string }
            funkcja?: string
          }>
        }>
      }
      dzial3?: {
        przedmiotDzialalnosci?: {
          // Real shape uses { kodDzial, kodKlasa, kodPodklasa, opis }
          // (verified probe). Loose typing — extractor handles both.
          przedmiotPrzewazajacejDzialalnosci?: Array<Record<string, string | undefined>>
          przedmiotPozostalejDzialalnosci?: Array<Record<string, string | undefined>>
        }
      }
      dzial6?: {
        likwidacja?: unknown | null
        upadlosc?: unknown | null
        rozwiazanieUniewaznienieEntity?: unknown | null
      }
    }
  }
}

// ────────────────────────────────────────────────────────────
// Normalized output (DB-ready)
// ────────────────────────────────────────────────────────────

export type KrsStatus = 'aktywny' | 'likwidacja' | 'upadlosc' | 'wykreslony'

export interface KrsBoardMember {
  function: string | null
  /** Anonimized — only role visible per RODO. */
  index: number
}

export interface KrsPkdEntry {
  kod: string
  opis: string | null
  isMain: boolean
}

export interface KrsNormalized {
  found: boolean
  krs_number: string | null
  full_name: string | null
  legal_form: string | null
  registration_date: string | null
  status: KrsStatus | null
  management_board: KrsBoardMember[]
  pkd_with_descriptions: KrsPkdEntry[]
  capital: { value: string; currency: string } | null
  raw: unknown
  checked_at: string
}

// ────────────────────────────────────────────────────────────
// Fetch + retry
// ────────────────────────────────────────────────────────────

class KrsNotFoundError extends Error {
  constructor(public readonly krs: string, public readonly rejestr: string) {
    super(`KRS ${krs} not found in rejestr ${rejestr}`)
    this.name = 'KrsNotFoundError'
  }
}

async function fetchKrsRaw(
  krs: string,
  rejestr: 'P' | 'S',
): Promise<KrsRawResponse> {
  const url = `${KRS_BASE}/api/krs/OdpisAktualny/${krs}?rejestr=${rejestr}&format=json`

  for (let attempt = 1; attempt <= KRS_RETRY_DELAYS_MS.length + 1; attempt += 1) {
    await throttle()
    const startedAt = Date.now()
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(KRS_TIMEOUT_MS),
      })
      const durationMs = Date.now() - startedAt

      if (res.status === 404) {
        console.log(`[KRS] GET 404 krs=${krs} rejestr=${rejestr} (${durationMs}ms)`)
        throw new KrsNotFoundError(krs, rejestr)
      }

      if (res.status === 503 || res.status === 504) {
        if (attempt <= KRS_RETRY_DELAYS_MS.length) {
          const delay = KRS_RETRY_DELAYS_MS[attempt - 1]
          console.warn(
            `[KRS] GET ${res.status} krs=${krs} (maintenance window?), retry ${attempt + 1} in ${delay / 1000}s`,
          )
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
        throw new Error(`KRS API ${res.status} after retries (krs=${krs})`)
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`KRS ${res.status}: ${text.slice(0, 200)} (krs=${krs})`)
      }

      const json = (await res.json()) as KrsRawResponse
      console.log(`[KRS] GET 200 krs=${krs} rejestr=${rejestr} (${durationMs}ms)`)
      return json
    } catch (err) {
      if (err instanceof KrsNotFoundError) throw err
      const isAbort =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      if (isAbort && attempt <= KRS_RETRY_DELAYS_MS.length) {
        const delay = KRS_RETRY_DELAYS_MS[attempt - 1]
        console.warn(`[KRS] timeout krs=${krs}, retry ${attempt + 1} in ${delay / 1000}s`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
  throw new Error(`KRS exhausted retries (krs=${krs})`)
}

/**
 * Fetch KRS з automatic P→S fallback gdy 404.
 */
export async function fetchKRSData(
  krs: string,
  preferredRejestr: 'P' | 'S' = 'P',
): Promise<KrsRawResponse> {
  try {
    return await fetchKrsRaw(krs, preferredRejestr)
  } catch (err) {
    if (err instanceof KrsNotFoundError) {
      const fallback = preferredRejestr === 'P' ? 'S' : 'P'
      console.log(`[KRS] krs=${krs} not in ${preferredRejestr}, trying ${fallback}`)
      return await fetchKrsRaw(krs, fallback)
    }
    throw err
  }
}

// ────────────────────────────────────────────────────────────
// Normalize raw → DB-ready
// ────────────────────────────────────────────────────────────

/** Convert KRS Polish date "06.04.2001" → ISO "2001-04-06". */
function parsePlDate(s: string | undefined | null): string | null {
  if (!s) return null
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function deriveStatus(raw: KrsRawResponse): KrsStatus {
  // Dzial6 fields use complex nested structure — actual keys verified
  // via probe: likwidacja / postepowanieUpadlosciowe / postepowanieNaprawcze /
  // rozwiazanieUniewaznienie are typical
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dzial6 = raw.odpis?.dane?.dzial6 as any
  if (dzial6?.postepowanieUpadlosciowe || dzial6?.upadlosc) return 'upadlosc'
  if (dzial6?.likwidacja) return 'likwidacja'
  if (dzial6?.rozwiazanieUniewaznienie || dzial6?.rozwiazanieUniewaznienieEntity)
    return 'wykreslony'
  return 'aktywny'
}

function extractBoard(raw: KrsRawResponse): KrsBoardMember[] {
  // Verified field path: dzial2.reprezentacja.sklad[]
  // Each member has funkcjaWOrganie (e.g. "CZŁONEK ZARZĄDU", "PREZES ZARZĄDU")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sklad = ((raw.odpis?.dane?.dzial2 as any)?.reprezentacja?.sklad ?? []) as Array<{
    funkcjaWOrganie?: string
    czyZawieszona?: boolean
  }>
  return sklad
    .filter((m) => !m.czyZawieszona)
    .map((m, idx) => ({
      function: m.funkcjaWOrganie ?? null,
      index: idx + 1,
    }))
}

function extractPkd(raw: KrsRawResponse): KrsPkdEntry[] {
  // Verified: PKD entries use { kodDzial, kodKlasa, kodPodklasa, opis }
  // — NOT { kodPKD, opisPKD }. Compose code as "{Dzial}.{Klasa}.{Podklasa}".
  const dzial3 = raw.odpis?.dane?.dzial3?.przedmiotDzialalnosci
  const out: KrsPkdEntry[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildCode = (p: any): string | null => {
    if (p.kodPKD) return p.kodPKD
    if (p.kodDzial && p.kodKlasa) {
      return `${p.kodDzial}.${p.kodKlasa}${p.kodPodklasa ? '.' + p.kodPodklasa : ''}`
    }
    return null
  }
  for (const p of dzial3?.przedmiotPrzewazajacejDzialalnosci ?? []) {
    const kod = buildCode(p)
    if (kod) out.push({ kod, opis: p.opis ?? p.opisPKD ?? null, isMain: true })
  }
  for (const p of dzial3?.przedmiotPozostalejDzialalnosci ?? []) {
    const kod = buildCode(p)
    if (kod) out.push({ kod, opis: p.opis ?? p.opisPKD ?? null, isMain: false })
  }
  return out
}

function extractCapital(raw: KrsRawResponse): KrsNormalized['capital'] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (raw.odpis?.dane?.dzial1?.kapital as any)?.wysokoscKapitaluZakladowego
  if (!cap?.wartosc) return null
  return { value: cap.wartosc, currency: cap.waluta ?? 'PLN' }
}

export function normalizeKrsResponse(raw: KrsRawResponse): KrsNormalized {
  const dane = raw.odpis?.dane?.dzial1?.danePodmiotu
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const naglowek = raw.odpis?.naglowekA as any
  return {
    found: true,
    krs_number: naglowek?.numerKRS ?? null,
    full_name: dane?.nazwa ?? null,
    legal_form: dane?.formaPrawna ?? null,
    // Use dataRejestracjiWKRS (verified field) — primary registration date
    registration_date:
      parsePlDate(naglowek?.dataRejestracjiWKRS) ??
      parsePlDate(naglowek?.dataRejestracji) ??
      null,
    status: deriveStatus(raw),
    management_board: extractBoard(raw),
    pkd_with_descriptions: extractPkd(raw),
    capital: extractCapital(raw),
    raw,
    checked_at: new Date().toISOString(),
  }
}

// ────────────────────────────────────────────────────────────
// High-level enrichment
// ────────────────────────────────────────────────────────────

export async function enrichWithKRS(
  krs: string,
  preferredRejestr: 'P' | 'S' = 'P',
): Promise<KrsNormalized> {
  // Pad KRS до 10 digits — KRS numbers stored з leading zeros
  const padded = krs.replace(/\D/g, '').padStart(10, '0')
  const raw = await fetchKRSData(padded, preferredRejestr)
  return normalizeKrsResponse(raw)
}

export { KrsNotFoundError }
