// lib/enrichment/apify.ts
// Sprint H — Apify Google Maps contact enrichment.
//
// Actor: compass/crawler-google-places ($0.007/result, simple JSON shape).
// Endpoint: https://api.apify.com/v2/acts/compass~crawler-google-places/
//   run-sync-get-dataset-items?token={APIFY_API_TOKEN}
//
// Behavior:
//   1. Build search query "{name} {city|voivodeship} Polska"
//   2. POST { searchStringsArray, maxCrawledPlaces: 3, language: "pl" }
//   3. Pick best match via Levenshtein name similarity (≥0.5 ratio)
//   4. Extract phone / email / website / gmaps URL / rating / reviewsCount
//   5. Return ApifyEnrichResult з status/cost/raw_payload
//
// Rate limit: in-memory token bucket 30 calls/min.
// Retry: 3 attempts на 5xx з exp backoff (1s, 2s, 4s).
// Idempotent contract: caller MUST check DB перед calling (not enforced тут).

const APIFY_BASE = 'https://api.apify.com/v2'
const ACTOR_ID = 'compass~crawler-google-places'
// Compass actor: cold-start ~30-60s + per-place scraping. 90s був надто тісним
// (Sprint H smoke показав timeouts). Bumped до 4 хв.
const REQUEST_TIMEOUT_MS = 240_000
const RATE_LIMIT_PER_MIN = 30
const RATE_WINDOW_MS = 60_000
const COST_PER_RESULT_USD = 0.007
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [1000, 2000, 4000]
const NAME_SIMILARITY_THRESHOLD = 0.5

// ─── Sliding window rate limiter ───
const requestTimestamps: number[] = []
async function rateLimit(): Promise<void> {
  const now = Date.now()
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_WINDOW_MS) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= RATE_LIMIT_PER_MIN) {
    const wait = requestTimestamps[0] + RATE_WINDOW_MS - now
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait))
      return rateLimit()
    }
  }
  requestTimestamps.push(now)
}

// ─── Levenshtein-based similarity ───
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const v0: number[] = new Array(b.length + 1).fill(0).map((_, i) => i)
  const v1: number[] = new Array(b.length + 1).fill(0)
  for (let i = 0; i < a.length; i += 1) {
    v1[0] = i + 1
    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
    }
    for (let j = 0; j < v0.length; j += 1) v0[j] = v1[j]
  }
  return v1[b.length] ?? 0
}

function similarity(a: string, b: string): number {
  const aN = a.toLowerCase().trim()
  const bN = b.toLowerCase().trim()
  if (!aN || !bN) return 0
  const dist = levenshtein(aN, bN)
  const maxLen = Math.max(aN.length, bN.length)
  return maxLen === 0 ? 1 : 1 - dist / maxLen
}

// ─── Public types ───
export interface ApifyTarget {
  name: string
  city?: string | null
  voivodeship?: string | null
  nip?: string | null
}

export interface ApifyEnrichResult {
  status: 'success' | 'no_match' | 'partial' | 'error'
  phone: string | null
  email: string | null
  website: string | null
  gmaps_url: string | null
  gmaps_rating: number | null
  gmaps_reviews_count: number | null
  raw_payload: unknown
  cost_usd: number
  error_message?: string
}

// ─── Apify actor response (compass crawler) ───
interface ApifyPlace {
  title?: string
  address?: string
  phone?: string | null
  phoneUnformatted?: string | null
  website?: string | null
  emails?: string[] | null
  url?: string // Google Maps URL
  totalScore?: number
  reviewsCount?: number
  categoryName?: string
  street?: string
  city?: string
  postalCode?: string
}

function buildQuery(target: ApifyTarget): string {
  const parts = [target.name]
  if (target.city) parts.push(target.city)
  else if (target.voivodeship) parts.push(target.voivodeship)
  parts.push('Polska')
  return parts.join(' ')
}

async function callApify(
  apiKey: string,
  searchQuery: string,
): Promise<ApifyPlace[]> {
  // memory=1024MB замість default 4096 — дозволяє більше concurrent runs у
  // межах account memory limit (8192MB total на free/starter). Cold-start
  // даний smaller actor instance — швидше, плюс avoids "memory-limit-exceeded"
  // 402 коли мaємo abandoned runs ще consuming slots after client timeouts.
  const url = `${APIFY_BASE}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}&memory=1024`
  const body = {
    searchStringsArray: [searchQuery],
    maxCrawledPlaces: 3,
    language: 'pl',
    countryCode: 'pl',
    deeperCityScrape: false,
    skipClosedPlaces: false,
  }

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) {
        if (res.status >= 500 && attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 1000))
          continue
        }
        const errBody = await res.text().catch(() => '')
        throw new Error(`Apify HTTP ${res.status}: ${errBody.slice(0, 200)}`)
      }
      const items = (await res.json()) as ApifyPlace[]
      return Array.isArray(items) ? items : []
    } catch (err) {
      lastError = err
      if (attempt < MAX_RETRIES - 1) {
        const isAbort = err instanceof Error && err.name === 'TimeoutError'
        if (!isAbort) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 1000))
          continue
        }
      }
      break
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function pickBestMatch(items: ApifyPlace[], targetName: string): ApifyPlace | null {
  if (items.length === 0) return null
  if (items.length === 1) {
    // Single result — accept якщо хоча б weak similarity
    const sim = similarity(targetName, items[0].title ?? '')
    return sim >= 0.3 ? items[0] : items[0] // permissive — single result
  }
  // Multiple → pick highest similarity
  let best: ApifyPlace | null = null
  let bestSim = -1
  for (const item of items) {
    const sim = similarity(targetName, item.title ?? '')
    if (sim > bestSim) {
      bestSim = sim
      best = item
    }
  }
  return bestSim >= NAME_SIMILARITY_THRESHOLD ? best : null
}

// ─── Public entry ───
export async function enrichContactsApify(
  apiKey: string,
  target: ApifyTarget,
): Promise<ApifyEnrichResult> {
  if (!apiKey) {
    return zeroResult('error', 0, 'APIFY_API_TOKEN missing')
  }
  if (!target.name?.trim()) {
    return zeroResult('error', 0, 'target.name empty')
  }

  await rateLimit()

  const query = buildQuery(target)
  let items: ApifyPlace[]
  try {
    items = await callApify(apiKey, query)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return zeroResult('error', 0, `Apify call failed: ${msg.slice(0, 200)}`)
  }

  const cost = items.length * COST_PER_RESULT_USD

  if (items.length === 0) {
    return zeroResult('no_match', cost, undefined, { query, items: [] })
  }

  const best = pickBestMatch(items, target.name)
  if (!best) {
    return zeroResult('no_match', cost, 'no result above similarity threshold', {
      query,
      items,
    })
  }

  const phone = best.phone ?? best.phoneUnformatted ?? null
  const email = best.emails && best.emails.length > 0 ? best.emails[0] : null
  const website = best.website ?? null
  const gmaps_url = best.url ?? null
  const gmaps_rating = typeof best.totalScore === 'number' ? best.totalScore : null
  const gmaps_reviews_count =
    typeof best.reviewsCount === 'number' ? best.reviewsCount : null

  const hasContact = Boolean(phone || email || website)
  const status: ApifyEnrichResult['status'] = hasContact ? 'success' : 'partial'

  return {
    status,
    phone,
    email,
    website,
    gmaps_url,
    gmaps_rating,
    gmaps_reviews_count,
    raw_payload: { query, best, all_results_count: items.length },
    cost_usd: Math.round(cost * 10000) / 10000,
  }
}

function zeroResult(
  status: ApifyEnrichResult['status'],
  cost: number,
  error?: string,
  raw?: unknown,
): ApifyEnrichResult {
  return {
    status,
    phone: null,
    email: null,
    website: null,
    gmaps_url: null,
    gmaps_rating: null,
    gmaps_reviews_count: null,
    raw_payload: raw ?? null,
    cost_usd: Math.round(cost * 10000) / 10000,
    error_message: error,
  }
}
