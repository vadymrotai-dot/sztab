// lib/enrichment/vat.ts
// VAT Biała Lista enrichment — Ministerstwo Finansów public API.
//
// Endpoint: https://wl-api.mf.gov.pl/api/search/nip/{NIP}?date=YYYY-MM-DD
// Rate limit: 10 req/sec per IP, 50000 req/day per IP. We throttle to
// 5 req/sec to be safe (room dla concurrent UI requests + bulk job).
//
// Status values per MF docs:
//   - Czynny — active VAT payer
//   - Zwolniony — VAT-exempt (small business)
//   - Niezarejestrowany — never registered (or 404 from API)
//   - Wykreślony — removed from register (DANGEROUS — usually means
//     fraud, bankruptcy, or non-compliance)

const VAT_API_BASE = 'https://wl-api.mf.gov.pl/api/search'

const VAT_RETRY_DELAYS_MS = [1000, 2000, 4000] as const
const VAT_TIMEOUT_MS = 15_000

export type VATStatus =
  | 'Czynny'
  | 'Zwolniony'
  | 'Niezarejestrowany'
  | 'Wykreślony'
  | (string & {})

export interface VATData {
  status: VATStatus | null
  registered_date: string | null // YYYY-MM-DD
  bank_accounts: string[]
  raw: unknown
  checked_at: string // ISO timestamp
}

interface VATSubject {
  name?: string
  nip?: string
  statusVat?: string
  regon?: string
  registrationLegalDate?: string | null
  removalDate?: string | null
  removalBasis?: string | null
  accountNumbers?: string[]
  hasVirtualAccounts?: boolean
}

interface VATResponse {
  result?: { subject?: VATSubject | null; requestId?: string; requestDateTime?: string }
}

// ────────────────────────────────────────────────────────────
// Rate limiter — sliding window (5 req/s safety margin)
// ────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 1000
const requestLog: number[] = []

async function acquireRateSlot(): Promise<void> {
  while (true) {
    const now = Date.now()
    while (requestLog.length > 0 && now - requestLog[0] >= RATE_LIMIT_WINDOW_MS) {
      requestLog.shift()
    }
    if (requestLog.length < RATE_LIMIT_MAX) {
      requestLog.push(now)
      return
    }
    const waitMs = RATE_LIMIT_WINDOW_MS - (now - requestLog[0]) + 50
    await new Promise((r) => setTimeout(r, waitMs))
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Normalize NIP: strip "PL" prefix, dashes, whitespace. */
export function normalizeNip(input: string): string {
  return input
    .replace(/^PL/i, '')
    .replace(/[\s-]/g, '')
    .trim()
}

/** Validate NIP format: exactly 10 digits. */
export function isValidNip(nip: string): boolean {
  return /^\d{10}$/.test(nip)
}

const todayIso = (): string => new Date().toISOString().slice(0, 10)

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────

export async function enrichWithVAT(rawNip: string): Promise<VATData> {
  const nip = normalizeNip(rawNip)
  if (!isValidNip(nip)) {
    throw new Error(`[VAT] Invalid NIP format: "${rawNip}" (cleaned: "${nip}", expected 10 digits)`)
  }

  const url = `${VAT_API_BASE}/nip/${nip}?date=${todayIso()}`

  for (let attempt = 1; attempt <= VAT_RETRY_DELAYS_MS.length + 1; attempt += 1) {
    await acquireRateSlot()

    try {
      const startedAt = Date.now()
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(VAT_TIMEOUT_MS),
      })
      const durationMs = Date.now() - startedAt

      // 404 = NIP not in VAT register. Treat as legitimate result.
      if (response.status === 404) {
        console.log(`[VAT] GET 404 nip=${nip} (${durationMs}ms) — Niezarejestrowany`)
        return {
          status: 'Niezarejestrowany',
          registered_date: null,
          bank_accounts: [],
          raw: { http_status: 404, nip },
          checked_at: new Date().toISOString(),
        }
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt <= VAT_RETRY_DELAYS_MS.length) {
          const delay = VAT_RETRY_DELAYS_MS[attempt - 1]
          console.warn(
            `[VAT] GET ${response.status} nip=${nip}, retry ${attempt + 1} in ${delay / 1000}s`,
          )
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
        throw new Error(`[VAT] ${response.status} after retries (nip=${nip})`)
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(`[VAT] ${response.status}: ${errText.slice(0, 200)} (nip=${nip})`)
      }

      const data = (await response.json()) as VATResponse
      const subject = data.result?.subject

      if (!subject) {
        // Sometimes API returns 200 with empty subject (no record)
        console.log(`[VAT] GET 200 nip=${nip} (${durationMs}ms) — empty subject, treating as Niezarejestrowany`)
        return {
          status: 'Niezarejestrowany',
          registered_date: null,
          bank_accounts: [],
          raw: data,
          checked_at: new Date().toISOString(),
        }
      }

      const status = (subject.statusVat ?? null) as VATStatus | null
      console.log(`[VAT] GET 200 nip=${nip} (${durationMs}ms) — ${status ?? 'unknown'}`)

      return {
        status,
        registered_date: subject.registrationLegalDate ?? null,
        bank_accounts: Array.isArray(subject.accountNumbers) ? subject.accountNumbers : [],
        raw: data,
        checked_at: new Date().toISOString(),
      }
    } catch (err) {
      const isAbort =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      if (isAbort && attempt <= VAT_RETRY_DELAYS_MS.length) {
        const delay = VAT_RETRY_DELAYS_MS[attempt - 1]
        console.warn(`[VAT] GET timeout nip=${nip}, retry ${attempt + 1} in ${delay / 1000}s`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }

  throw new Error(`[VAT] exhausted retries for nip=${nip}`)
}
