// lib/enrichment/wolt.ts
// Sprint S6D Day 2 (11.05.2026) — Apify Wolt menu scraper.
//
// Actor: needy_hammock/wolt-restaurant-menu-scraper
// Pricing: $0.80 / 1,000 results — найдешевша HoReCa scraper option у repo.
// Endpoint: https://api.apify.com/v2/acts/needy_hammock~wolt-restaurant-menu-scraper/
//   run-sync-get-dataset-items?token={APIFY_API_TOKEN}
//
// Behavior:
//   1. Build search query "{name} {city}"
//   2. POST з search params (city, query)
//   3. Match by name similarity ≥ 0.5
//   4. Extract menu items: name_pl, price_pln, category, description, image_url
//   5. Return WoltEnrichResult з restaurant_rating + dishes
//
// Persistence pattern: contact_enrichment row з source='wolt_menu', dishes
// у raw_payload. Composite key (target_type, target_id, source) unique.
//
// Rate limit: in-memory bucket 30/min (own — independent від apify.ts).

const APIFY_BASE = 'https://api.apify.com/v2'
const ACTOR_ID = 'needy_hammock~wolt-restaurant-menu-scraper'
const REQUEST_TIMEOUT_MS = 240_000
const RATE_LIMIT_PER_MIN = 30
const RATE_WINDOW_MS = 60_000
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [1000, 2000, 4000]
const NAME_SIMILARITY_THRESHOLD = 0.5
// $0.80 / 1000 results = $0.0008 per restaurant — pricing reference verified
// у Apify Store May 2026 (research v4 §Q2).
const COST_PER_RESULT_USD = 0.0008

// ─── Rate limiter ───
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

// ─── Levenshtein similarity (copy z apify.ts pattern) ───
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
export interface WoltTarget {
  name: string
  city?: string | null
}

export interface WoltDish {
  name_pl: string
  price_pln: number | null
  category: string | null
  description: string | null
  image_url: string | null
}

export interface WoltEnrichResult {
  status: 'success' | 'no_match' | 'partial' | 'error'
  wolt_url: string | null
  restaurant_name: string | null
  rating: number | null
  dishes: WoltDish[]
  raw_payload: unknown
  cost_usd: number
  error_message?: string
}

// ─── Apify actor response shape (defensive) ───
interface WoltApifyMenuItem {
  name?: string
  price?: number | string | null
  priceText?: string
  category?: string
  description?: string
  imageUrl?: string
  image?: string
}
interface WoltApifyPayload {
  name?: string
  url?: string
  restaurantUrl?: string
  rating?: number
  city?: string
  menu?: WoltApifyMenuItem[]
  items?: WoltApifyMenuItem[]
  products?: WoltApifyMenuItem[]
}

function buildQuery(target: WoltTarget): string {
  const parts = [target.name]
  if (target.city) parts.push(target.city)
  return parts.join(' ')
}

function parsePricePln(raw: number | string | null | undefined): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const cleaned = raw.replace(/[^\d,.\-]/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

async function callApify(
  apiKey: string,
  searchQuery: string,
  city: string | null,
): Promise<WoltApifyPayload[]> {
  const url = `${APIFY_BASE}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}&memory=1024`
  // Wolt actors often use {city, search} input shape.
  const body = {
    city: city ?? 'warszawa',
    search: searchQuery,
    searchTerm: searchQuery,
    maxResults: 3,
    maxItems: 3,
    countryCode: 'pl',
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
        throw new Error(`Wolt (Apify) HTTP ${res.status}: ${errBody.slice(0, 200)}`)
      }
      const items = (await res.json()) as WoltApifyPayload[]
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

function pickBestMatch(
  items: WoltApifyPayload[],
  targetName: string,
): { match: WoltApifyPayload; sim: number } | null {
  if (items.length === 0) return null
  let best: WoltApifyPayload | null = null
  let bestSim = -1
  for (const item of items) {
    const sim = similarity(targetName, item.name ?? '')
    if (sim > bestSim) {
      bestSim = sim
      best = item
    }
  }
  if (!best) return null
  // Sprint S6D Day 2 REVISION (12.05.2026) — tighten single-result case.
  // Earlier permissive rule "if items.length === 1 → accept без similarity
  // check" produced false positives коли Wolt actor returns nearest match
  // (e.g. McDonald's) для restaurants NOT on Wolt platform. New rule:
  // require sim >= 0.5 navet для single result. Якщо < 0.5 → null →
  // status='no_match' з note "Restaurant not on Wolt".
  if (bestSim >= NAME_SIMILARITY_THRESHOLD) {
    return { match: best, sim: bestSim }
  }
  return null
}

function extractDishes(payload: WoltApifyPayload): WoltDish[] {
  const items = payload.menu ?? payload.items ?? payload.products ?? []
  const dishes: WoltDish[] = []
  for (const it of items) {
    const name = it.name ?? ''
    if (!name.trim()) continue
    dishes.push({
      name_pl: name.trim(),
      price_pln: parsePricePln(it.price ?? it.priceText ?? null),
      category: it.category ?? null,
      description: it.description ?? null,
      image_url: it.imageUrl ?? it.image ?? null,
    })
  }
  return dishes
}

// ─── Public entry ───
export async function enrichMenuWolt(
  apiKey: string,
  target: WoltTarget,
): Promise<WoltEnrichResult> {
  if (!apiKey) {
    return zeroResult('error', 0, 'APIFY_API_TOKEN missing')
  }
  if (!target.name?.trim()) {
    return zeroResult('error', 0, 'target.name empty')
  }

  await rateLimit()

  const query = buildQuery(target)
  let items: WoltApifyPayload[]
  try {
    items = await callApify(apiKey, query, target.city ?? null)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return zeroResult('error', 0, `Wolt call failed: ${msg.slice(0, 200)}`)
  }

  const cost = items.length * COST_PER_RESULT_USD
  if (items.length === 0) {
    return zeroResult('no_match', cost, undefined, { query, items: [] })
  }

  const picked = pickBestMatch(items, target.name)
  if (!picked) {
    return zeroResult('no_match', cost, 'no result above similarity threshold', {
      query,
      items,
    })
  }

  const dishes = extractDishes(picked.match)
  return {
    status: dishes.length > 0 ? 'success' : 'partial',
    wolt_url: picked.match.url ?? picked.match.restaurantUrl ?? null,
    restaurant_name: picked.match.name ?? null,
    rating: typeof picked.match.rating === 'number' ? picked.match.rating : null,
    dishes,
    raw_payload: {
      query,
      best: picked.match,
      all_results_count: items.length,
      name_similarity: picked.sim,
    },
    cost_usd: Math.round(cost * 10000) / 10000,
  }
}

function zeroResult(
  status: WoltEnrichResult['status'],
  cost: number,
  error?: string,
  raw?: unknown,
): WoltEnrichResult {
  return {
    status,
    wolt_url: null,
    restaurant_name: null,
    rating: null,
    dishes: [],
    raw_payload: raw ?? null,
    cost_usd: Math.round(cost * 10000) / 10000,
    error_message: error,
  }
}
