// lib/ceidg/client.ts
// CEIDG API v3 client. dane.biznes.gov.pl/api/ceidg/v3.
//
// Auth:    Authorization: Bearer <JWT>  (user-managed klucz w params.ceidg_api_key)
// Filters: repeated query params BEZ brackets (?pkd=5610A&wojewodztwo=mazowieckie)
//          wojewodztwo lowercase w URL, ale CEIDG zwraca UPPERCASE w response.
// Limits:  CEIDG public docs sugerują 50 req / 180s window (Phase 2.6 default).
//          Retry: 429/5xx exponential backoff (1s, 2s, 4s, max 3 retries).
//
// Probe (2026-04-27) zweryfikował shape — patrz lib/ceidg/types.ts.

import { createClient } from '@/lib/supabase/server'

import type {
  CeidgDetailResponse,
  CeidgFilters,
  CeidgFirmaDetails,
  CeidgListItem,
  CeidgListResponse,
} from './types'

const CEIDG_BASE = 'https://dane.biznes.gov.pl/api/ceidg/v3'

// Rate limit window — 50 calls / 180s. Konserwatywnie, lepiej zwolnić
// niż dostać 429 i czekać dłużej. Konfigurowalne przez constructor.
const DEFAULT_MAX_REQUESTS = 50
const DEFAULT_WINDOW_MS = 180_000

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000]

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Compact PKD code: usuwa kropki, normalizuje do uppercase.
 * "56.10.A" → "5610A", "5610a" → "5610A". CEIDG właśnie tak zwraca.
 */
export function normalizePkd(pkd: string): string {
  return pkd.replace(/\./g, '').toUpperCase()
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

function buildQuery(params: Record<string, string | number | undefined>): string {
  const entries: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return entries.length > 0 ? `?${entries.join('&')}` : ''
}

function filtersToQuery(filters: CeidgFilters): Record<string, string> {
  const out: Record<string, string> = {}
  if (filters.pkd) out.pkd = normalizePkd(filters.pkd)
  if (filters.wojewodztwo) out.wojewodztwo = filters.wojewodztwo.toLowerCase()
  if (filters.status) out.status = filters.status
  if (filters.miasto) out.miasto = filters.miasto
  return out
}

/**
 * Pobiera ostatnią page z links.last URL: ".../firmy?...&page=845" → 845.
 * Zwraca null jeśli URL bez page param (single-page result).
 */
function parseLastPage(lastUrl: string | undefined): number | null {
  if (!lastUrl) return null
  try {
    const url = new URL(lastUrl)
    const page = url.searchParams.get('page')
    return page === null ? null : Number.parseInt(page, 10)
  } catch {
    return null
  }
}

// ────────────────────────────────────────────────────────────
// Params getter — pattern jak gemini/apify/krs (intelligence.ts).
// RLS auto-scope per-user. ENV fallback dla seed/standalone scripts.
// ────────────────────────────────────────────────────────────

export async function getCeidgApiKey(): Promise<string> {
  const supabase = await createClient()
  const { data: paramsRow } = await supabase
    .from('params')
    .select('ceidg_api_key')
    .single()

  const key =
    (paramsRow?.ceidg_api_key as string | null | undefined) ||
    process.env.CEIDG_API_KEY ||
    ''

  if (!key) {
    throw new Error(
      'Brak klucza CEIDG API. Dodaj go w Ustawieniach → Klucze API.',
    )
  }
  return key
}

// ────────────────────────────────────────────────────────────
// CeidgClient
// ────────────────────────────────────────────────────────────

export interface CeidgClientOptions {
  maxRequestsPerWindow?: number
  windowMs?: number
}

export class CeidgClient {
  private readonly apiKey: string
  private readonly maxRequests: number
  private readonly windowMs: number

  // Sliding window — timestamps ostatnich requestów. Stare wpisy
  // (>windowMs temu) są filtrowane przed sprawdzeniem limitu.
  private requestLog: number[] = []

  constructor(apiKey: string, options: CeidgClientOptions = {}) {
    if (!apiKey) throw new Error('CeidgClient: apiKey is required')
    this.apiKey = apiKey
    this.maxRequests = options.maxRequestsPerWindow ?? DEFAULT_MAX_REQUESTS
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
  }

  // ────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────

  /**
   * GET /firmy z paginacją (page index od 0). Zwraca pełną response
   * (firmy + count + links).
   */
  async listFirms(
    filters: CeidgFilters,
    page = 0,
    limit = 25,
  ): Promise<CeidgListResponse> {
    const query = buildQuery({
      ...filtersToQuery(filters),
      page,
      limit,
    })
    const url = `${CEIDG_BASE}/firmy${query}`
    return this.fetchJson<CeidgListResponse>(url)
  }

  /**
   * GET /firma/{id}. Zwraca jeden CeidgFirmaDetails (rozwija array
   * wrapper z response). Null gdy firma nie znaleziona (404).
   */
  async getFirmDetails(id: string): Promise<CeidgFirmaDetails | null> {
    const url = `${CEIDG_BASE}/firma/${encodeURIComponent(id)}`
    const data = await this.fetchJson<CeidgDetailResponse>(url, {
      allow404: true,
    })
    if (!data || !Array.isArray(data.firma) || data.firma.length === 0) {
      return null
    }
    return data.firma[0]
  }

  /**
   * Async generator po wszystkich stronach dla zadanych filtrów.
   * Yielduje pojedyncze CeidgListItem żeby konsument mógł streamować
   * insert do DB bez bufowania całej kolekcji w pamięci.
   *
   * Pierwsza strona zwraca count + links.last → znamy total_pages.
   */
  async *paginateAll(
    filters: CeidgFilters,
    limit = 25,
  ): AsyncGenerator<CeidgListItem, void, void> {
    let page = 0
    let totalPages: number | null = null

    while (true) {
      const response = await this.listFirms(filters, page, limit)

      if (totalPages === null) {
        totalPages = parseLastPage(response.links.last)
      }

      for (const firm of response.firmy) {
        yield firm
      }

      // Zatrzymaj gdy brak `next` lub gdy page przekroczyła last.
      if (!response.links.next) break
      if (totalPages !== null && page >= totalPages) break
      page += 1
    }
  }

  // ────────────────────────────────────────────────────────────
  // Internals: rate limiter + retry + fetch
  // ────────────────────────────────────────────────────────────

  /**
   * Waitloop dopóki nie wpadniemy w sliding window. Po wejściu rejestruje
   * własny request w logu.
   */
  private async acquireRateSlot(): Promise<void> {
    while (true) {
      const now = Date.now()
      this.requestLog = this.requestLog.filter((t) => now - t < this.windowMs)
      if (this.requestLog.length < this.maxRequests) {
        this.requestLog.push(now)
        return
      }
      const oldest = this.requestLog[0]
      const waitMs = this.windowMs - (now - oldest) + 50 // mały bufor
      console.log(
        `[CEIDG] rate limit reached (${this.requestLog.length}/${this.maxRequests}), sleep ${waitMs}ms`,
      )
      await sleep(waitMs)
    }
  }

  private async fetchJson<T>(
    url: string,
    options: { allow404?: boolean } = {},
  ): Promise<T> {
    let lastError: unknown = null

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      await this.acquireRateSlot()

      const startedAt = Date.now()
      // URL bez klucza — Bearer header. Logujemy bez tokena.
      const sanitizedUrl = url.replace(this.apiKey, '<key>')

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
          },
          // 120s — CEIDG combo filterów (pkd+woj+status) zimnego cache
          // może wracać 60-90s (per Vadym 2026-05-03 timeout incident
          // page 11). 120s = bezpieczny bufor dla outlier-ów. Zwiększone
          // z 60s, oryginalnie probe-em 2026-04-27.
          signal: AbortSignal.timeout(120_000),
        })

        const durationMs = Date.now() - startedAt

        if (response.status === 404 && options.allow404) {
          console.log(
            `[CEIDG] GET 404 ${sanitizedUrl} (${durationMs}ms) — allow404`,
          )
          // Caller (getFirmDetails) wie jak interpretować null.
          return null as T
        }

        if (response.status === 429 || response.status >= 500) {
          const errBody = await response.text().catch(() => '')
          lastError = new Error(
            `CEIDG ${response.status}: ${errBody.slice(0, 200)}`,
          )
          console.warn(
            `[CEIDG] GET ${response.status} ${sanitizedUrl} (${durationMs}ms) — retryable, attempt ${attempt + 1}`,
          )
          if (attempt < RETRY_DELAYS_MS.length) {
            await sleep(RETRY_DELAYS_MS[attempt])
            continue
          }
          throw lastError
        }

        if (!response.ok) {
          const errBody = await response.text().catch(() => '')
          console.error(
            `[CEIDG] GET ${response.status} ${sanitizedUrl} (${durationMs}ms) — non-retryable`,
            errBody.slice(0, 300),
          )
          throw new Error(
            `CEIDG ${response.status}: ${errBody.slice(0, 200)}`,
          )
        }

        const data = (await response.json()) as T
        console.log(
          `[CEIDG] GET ${response.status} ${sanitizedUrl} (${durationMs}ms)`,
        )
        return data
      } catch (err) {
        const isAbort =
          err instanceof Error &&
          (err.name === 'TimeoutError' || err.name === 'AbortError')
        lastError = err
        if (isAbort && attempt < RETRY_DELAYS_MS.length) {
          console.warn(
            `[CEIDG] GET timeout ${sanitizedUrl} — retry ${attempt + 1}`,
          )
          await sleep(RETRY_DELAYS_MS[attempt])
          continue
        }
        // Non-retryable lub wyczerpane retries
        throw err
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('CEIDG fetch failed: unknown error')
  }
}
