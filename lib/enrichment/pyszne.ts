// lib/enrichment/pyszne.ts
// Sprint S6D Day 2 (11.05.2026) — Apify Pyszne.pl menu scraper.
//
// Actor: easyapi/just-eat-restaurant-menu-scraper (Just Eat covers Pyszne.pl)
// Endpoint: https://api.apify.com/v2/acts/easyapi~just-eat-restaurant-menu-scraper/
//   run-sync-get-dataset-items?token={APIFY_API_TOKEN}
//
// Behavior:
//   1. Build search query "{name} {city}"
//   2. POST z searchTerm + countryCode='pl'
//   3. Match by name similarity ≥ 0.5 (mirrors apify.ts)
//   4. Extract menu items: name_pl, price_pln, category, description, image_url
//   5. Return PyszneEnrichResult з status/cost/raw_payload
//
// Persistence pattern: contact_enrichment row з source='pyszne_menu',
// dishes у raw_payload (нema okремої menu_data column — leverage existing
// schema). Composite key (target_type, target_id, source) unique per Apify
// pattern.
//
// Rate limit: in-memory token bucket 30 calls/min (mirrors apify.ts).
// Retry: 3 attempts на 5xx з exp backoff (1s, 2s, 4s).
// Cost: ~$0.01-0.05 per restaurant (varies per actor pricing — check Apify
// console post-call for actual usage). Tracked у result.cost_usd.

const APIFY_BASE = 'https://api.apify.com/v2'
const ACTOR_ID = 'easyapi~just-eat-restaurant-menu-scraper'
const REQUEST_TIMEOUT_MS = 240_000
const RATE_LIMIT_PER_MIN = 30
const RATE_WINDOW_MS = 60_000
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [1000, 2000, 4000]
const NAME_SIMILARITY_THRESHOLD = 0.5
// Approximate cost-per-result; actual billing у Apify console (per-call basis).
const COST_PER_RESULT_USD = 0.02

// ─── Sliding window rate limiter (own bucket — independent of apify.ts) ───
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

// ─── Levenshtein-based similarity (copy z apify.ts pattern) ───
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
export interface PyszneTarget {
  name: string
  city?: string | null
  voivodeship?: string | null
}

export interface PyszneDish {
  /** Polish dish name as-displayed */
  name_pl: string
  /** Price у zł (PLN). Null якщо unparseable. */
  price_pln: number | null
  /** Category з menu (np. "Burgery", "Pizza", "Napoje") */
  category: string | null
  description: string | null
  image_url: string | null
}

export interface PyszneEnrichResult {
  status: 'success' | 'no_match' | 'partial' | 'error'
  pyszne_url: string | null
  restaurant_name: string | null
  dishes: PyszneDish[]
  raw_payload: unknown
  cost_usd: number
  error_message?: string
}

// ─── Apify actor response shape (defensive — varies per actor version) ───
interface ApifyMenuItem {
  name?: string
  title?: string
  price?: number | string | null
  priceText?: string
  category?: string
  categoryName?: string
  description?: string
  imageUrl?: string
  image?: string
}
interface ApifyRestaurantPayload {
  name?: string
  title?: string
  url?: string
  restaurantUrl?: string
  city?: string
  menu?: ApifyMenuItem[]
  items?: ApifyMenuItem[]
  products?: ApifyMenuItem[]
}

function buildQuery(target: PyszneTarget): string {
  const parts = [target.name]
  if (target.city) parts.push(target.city)
  return parts.join(' ')
}

/** Best-effort price parse from numeric або PL-formatted string ("12,50 zł"). */
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
): Promise<ApifyRestaurantPayload[]> {
  const url = `${APIFY_BASE}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}&memory=1024`
  const body = {
    // Defensive: try multiple known input field names що Apify actors
    // commonly use. Actor accepts any subset.
    searchTerm: searchQuery,
    searchTerms: [searchQuery],
    countryCode: 'pl',
    maxResults: 3,
    maxItems: 3,
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
        throw new Error(`Pyszne (Apify) HTTP ${res.status}: ${errBody.slice(0, 200)}`)
      }
      const items = (await res.json()) as ApifyRestaurantPayload[]
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
  items: ApifyRestaurantPayload[],
  targetName: string,
): { match: ApifyRestaurantPayload; sim: number } | null {
  if (items.length === 0) return null
  let best: ApifyRestaurantPayload | null = null
  let bestSim = -1
  for (const item of items) {
    const itemName = item.name ?? item.title ?? ''
    const sim = similarity(targetName, itemName)
    if (sim > bestSim) {
      bestSim = sim
      best = item
    }
  }
  if (!best) return null
  if (items.length === 1 || bestSim >= NAME_SIMILARITY_THRESHOLD) {
    return { match: best, sim: bestSim }
  }
  return null
}

function extractDishes(payload: ApifyRestaurantPayload): PyszneDish[] {
  // Defensive: try different known nesting keys (actor versions vary).
  const items = payload.menu ?? payload.items ?? payload.products ?? []
  const dishes: PyszneDish[] = []
  for (const it of items) {
    const name = it.name ?? it.title ?? ''
    if (!name.trim()) continue
    dishes.push({
      name_pl: name.trim(),
      price_pln: parsePricePln(it.price ?? it.priceText ?? null),
      category: it.category ?? it.categoryName ?? null,
      description: it.description ?? null,
      image_url: it.imageUrl ?? it.image ?? null,
    })
  }
  return dishes
}

// ─── Public entry ───
export async function enrichMenuPyszne(
  apiKey: string,
  target: PyszneTarget,
): Promise<PyszneEnrichResult> {
  if (!apiKey) {
    return zeroResult('error', 0, 'APIFY_API_TOKEN missing')
  }
  if (!target.name?.trim()) {
    return zeroResult('error', 0, 'target.name empty')
  }

  await rateLimit()

  const query = buildQuery(target)
  let items: ApifyRestaurantPayload[]
  try {
    items = await callApify(apiKey, query)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return zeroResult('error', 0, `Pyszne call failed: ${msg.slice(0, 200)}`)
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
  const restaurantName = picked.match.name ?? picked.match.title ?? null
  const pyszneUrl = picked.match.url ?? picked.match.restaurantUrl ?? null

  return {
    status: dishes.length > 0 ? 'success' : 'partial',
    pyszne_url: pyszneUrl,
    restaurant_name: restaurantName,
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
  status: PyszneEnrichResult['status'],
  cost: number,
  error?: string,
  raw?: unknown,
): PyszneEnrichResult {
  return {
    status,
    pyszne_url: null,
    restaurant_name: null,
    dishes: [],
    raw_payload: raw ?? null,
    cost_usd: Math.round(cost * 10000) / 10000,
    error_message: error,
  }
}
