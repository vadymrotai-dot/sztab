// lib/rejestrio/client.ts
// Sprint S1 Phase 2 — rejestr.io v2 base client.
//
// Auth: bare token у Authorization header (verified Sprint M probe).
// All endpoints use URL-path patterns, not query strings.
// Rate limit: Biznes plan ~10000 calls/month — no per-request throttling
// needed beyond polite gentle pacing у bulk loops.

const REJESTR_BASE = 'https://rejestr.io/api/v2'
const REQUEST_TIMEOUT_MS = 25_000
const RETRY_DELAYS_MS = [1_000, 3_000] as const

export class RejestrioError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
    message: string,
  ) {
    super(`rejestr.io ${endpoint} HTTP ${status}: ${message}`)
    this.name = 'RejestrioError'
  }
}

export async function rejestrioGet<T = unknown>(
  apiKey: string,
  pathSuffix: string,
): Promise<T> {
  const url = `${REJESTR_BASE}${pathSuffix.startsWith('/') ? '' : '/'}${pathSuffix}`

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (res.status === 404) {
        // 404 у rejestr.io часто means "rozdzial empty/missing" — caller
        // może handle gracefully. Throw, не return null, щоб caller
        // explicitly catches.
        const text = await res.text().catch(() => '')
        throw new RejestrioError(pathSuffix, 404, text.slice(0, 200))
      }
      if (res.status === 429 || res.status === 503) {
        if (attempt < RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
          continue
        }
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new RejestrioError(pathSuffix, res.status, text.slice(0, 300))
      }
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof RejestrioError) throw err
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
        continue
      }
      throw err
    }
  }
  throw new Error(`rejestr.io ${pathSuffix} exhausted retries`)
}
