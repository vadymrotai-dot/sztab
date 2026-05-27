// lib/enrichment/apify.ts
// Sprint H — Apify Google Maps contact enrichment.
// Sprint S6D Day 3 (12.05.2026) — REVERTED актор з compass/google-maps-extractor
// назад до compass/crawler-google-places. Reason: extractor мав timeout issues
// (Day 2 REVISION smoke test показав 240s+ runs за Vercel ceiling 120s). Old
// actor stable з ~30-45s typical run.
//
// Plus enabled `scrapePlaceDetailPage: true` що exposes ще fields:
// reviewsDistribution, popularTimes, **orderBy** (food delivery providers
// — може містити menu hints), peopleAlsoSearch, reviewsTags, hotel fields.
//
// Day 2 REVISION's `menu_dishes` extraction logic preserved — defensive
// parsing tries multiple key names (menu/menuItems/popularDishes/dishes).
// Якщо crawler-google-places returns popular dishes у raw_payload — extracted.
// Якщо ні — empty array (acceptable; full menu via website-menu.ts WWW path).
//
// Actor: compass/crawler-google-places (back to Sprint H original).
// Endpoint: https://api.apify.com/v2/acts/compass~crawler-google-places/
//   run-sync-get-dataset-items?token={APIFY_API_TOKEN}
//
// Behavior:
//   1. Build search query "{name} {city|voivodeship} Polska"
//   2. POST { searchStringsArray, maxCrawledPlaces: 3, scrapePlaceDetailPage: true }
//   3. Pick best match via Levenshtein name similarity (≥0.5 ratio)
//   4. Extract phone / email / website / gmaps URL / rating / reviewsCount
//      + menu_dishes (popular dishes якщо actor returns)
//   5. Return ApifyEnrichResult з status/cost/raw_payload + menu_dishes
//
// Rate limit: in-memory token bucket 30 calls/min.
// Retry: 3 attempts на 5xx з exp backoff (1s, 2s, 4s).
// Idempotent contract: caller MUST check DB перед calling (not enforced тут).

const APIFY_BASE = 'https://api.apify.com/v2'
const ACTOR_ID = 'compass~crawler-google-places'
// Sprint TYDZIEN1.A.2 (27.05.2026) — RAISED 25s → 80s after diagnose 24/24
// Apify_GMaps partial з-за tego cap. Apify Compass scraper з
// scrapePlaceDetailPage=true typowo kończy 90-200s na 3 places (review +
// popularTimes + menu + ...). Sztab abortował 25s wcześniej niż Apify
// zwracał rezultat — strata kosztów Apify side ($2-5/sprint), zero partials
// saved у Sztab.
//
// Vercel Pro 300s ceiling allows 80-90s budget for Apify (Apify Compass actor
// typically completes 90-200s for 3 places with detail pages). Budget math:
// 90s Apify + ~25s pozostałe Phase B + 5s margin = 120s ≤ 300s ceiling.
//
// Legacy comment (now superseded — kept for context):
//   Sprint S-CEIDG-DETAILS Day 1 PATCH (15.05.2026) lowered 240_000 → 25_000
//   to fit Vercel function ceiling 120s. Over-corrected — almost all runs
//   abortowane. A.2 raises back до safe 80s.
const REQUEST_TIMEOUT_MS = 80_000
/** Sprint TYDZIEN1.A.2 (27.05.2026) — RAISED 30s → 90s. Outer hard ceiling
 *  dla całego enrichContactsApify (Promise.race у public entry). Zachowuje
 *  Phase B budget — CEIDG_details + AI кроки після Apify obowiązkowo run.
 *  Якщо Apify не вкладається у 90s → повертаємо status='partial' з error_message
 *  'APIFY_TIMEOUT_90S'. Caller (route.ts:696-712) handles partial gracefully.
 *  Note: existing "no retry on AbortError" behavior kept; if still timeout,
 *  raise via ENV flag in future (sprint A.3+). */
const APIFY_HARD_TIMEOUT_MS = 90_000
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
  /** Sprint S6C STEP 2 (11.05.2026) — known phone number from clients/CEIDG.
   *  Якщо present, pickBestMatch overrides name-similarity threshold коли
   *  Apify item phone normalized matches. SOLERA edge: name "SOLERA Wilcza"
   *  на Google ≠ DB title "SOLERA SP. Z O.O." але phone identical → accept. */
  phone?: string | null
}

/** Sprint S6D Day 2 REVISION (12.05.2026) — menu dish extracted з Google
 *  Maps detail page. Google Maps typically rendert top 3-5 popular dishes,
 *  не повний menu. Use як supplementary signal; full menu via WWW fetch
 *  (lib/enrichment/website-menu.ts) as primary source. */
export interface ApifyMenuDish {
  name_pl: string
  price_pln: number | null
  description: string | null
  image_url: string | null
}

export interface ApifyEnrichResult {
  status: 'success' | 'no_match' | 'partial' | 'error'
  phone: string | null
  email: string | null
  website: string | null
  gmaps_url: string | null
  gmaps_rating: number | null
  gmaps_reviews_count: number | null
  /** Sprint S6D Day 2 REVISION — menu dishes з Google Maps profile.
   *  Empty array якщо actor не повертає menu (common for non-restaurants).
   *  3-5 dishes typical (Google rendert "popular" subset). Full menu — WWW
   *  fallback. */
  menu_dishes: ApifyMenuDish[]
  /** Sprint S-DISCOVERY.1 (16.05.2026) — extracted brand name from Google
   *  Business Profile title. Cleaned (legal forms + trailing city stripped).
   *  Source: best.title коли status='success' AND name_similarity > 0.5.
   *  Use case: brand cascade fallback у STEP 6.6 (lookup/route.ts) коли CEIDG
   *  no koncesja AND AI extracted_brand low confidence (Domek Sushi class).
   *  null коли status≠success або similarity threshold не passed або title
   *  empty after cleaning. */
  business_name: string | null
  /** Sprint S-DISCOVERY.1 — Google verified business category (e.g. "Sushi",
   *  "Hurtownia owoców i warzyw"). Bonus signal for product matching algo.
   *  null коли Apify не повертає або status≠success. */
  business_category: string | null
  raw_payload: unknown
  cost_usd: number
  error_message?: string
}

// ─── Apify actor response (compass google-maps-extractor) ───
// Defensive: actor output shape varies per version. Include known + likely
// menu field names. Real shape verified post-smoke-test.
interface ApifyMenuItemRaw {
  name?: string
  title?: string
  price?: number | string | null
  priceText?: string
  description?: string
  imageUrl?: string
  image?: string
}
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
  // Sprint S6D Day 2 — menu fields per compass/google-maps-extractor docs.
  // Multiple key candidates бо actor schema undocumented для menus.
  menu?: ApifyMenuItemRaw[]
  menuItems?: ApifyMenuItemRaw[]
  popularDishes?: ApifyMenuItemRaw[]
  dishes?: ApifyMenuItemRaw[]
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
  // Sprint S6D Day 3 — back to original crawler-google-places input shape.
  // Added `scrapePlaceDetailPage: true` що enables: reviewsDistribution,
  // imageCategories, popularTimes, openingHours, peopleAlsoSearch, reviewsTags,
  // updatesFromCustomers, questionsAndAnswers, tableReservationLinks, orderBy,
  // ownerUpdates, hotel fields. Якщо actor returns menu items у raw payload
  // — picked up via defensive extractMenuDishes helper.
  const body = {
    searchStringsArray: [searchQuery],
    maxCrawledPlaces: 3,
    language: 'pl',
    countryCode: 'pl',
    deeperCityScrape: false,
    skipClosedPlaces: false,
    scrapePlaceDetailPage: true,
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
        // Sprint S6D Day 4 BUGFIX (12.05.2026) — surface billing/auth errors
        // explicitly. Cohort enrichment failed 35/49 NIPs з HTTP 402 silent
        // generic "Apify call failed" — Vadym не wiedział, що Apify account
        // balance exhausted.
        if (res.status === 402) {
          throw new Error(
            `Apify billing exhausted (HTTP 402). Sprawdź konto na https://console.apify.com/billing — doładuj saldo aby kontynuować enrichment. Details: ${errBody.slice(0, 300)}`,
          )
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error(
            `Apify token nieprawidłowy lub bez uprawnień (HTTP ${res.status}). Sprawdź params.apify_api_token у /settings. Details: ${errBody.slice(0, 200)}`,
          )
        }
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

/** Sprint S6C STEP 2 (11.05.2026) — normalize phone для match override.
 *  Strips +, spaces, dashes, parentheses, leading 48 country code. Keeps digits. */
function normalizePhone(p: string | null | undefined): string {
  if (!p) return ''
  const digits = p.replace(/\D/g, '')
  // Strip Polish country code 48 prefix якщо present
  if (digits.startsWith('48') && digits.length >= 11) return digits.slice(2)
  return digits
}

interface PickResult {
  match: ApifyPlace
  override: 'phone_match' | null
  name_similarity: number
}

function pickBestMatch(
  items: ApifyPlace[],
  targetName: string,
  targetPhone: string | null = null,
): PickResult | null {
  if (items.length === 0) return null

  // Sprint S6C STEP 2 — phone-match override. Якщо target має known phone
  // AND any Apify item phone normalize matches → accept regardless of name
  // similarity. SOLERA edge case (Google "SOLERA Wilcza" ≠ DB title але
  // phone +48 22 866 41 61 ідентичний).
  const targetPhoneN = normalizePhone(targetPhone)
  if (targetPhoneN.length >= 7) {
    for (const item of items) {
      const itemPhoneN = normalizePhone(item.phone ?? item.phoneUnformatted ?? null)
      if (itemPhoneN.length >= 7 && itemPhoneN === targetPhoneN) {
        return {
          match: item,
          override: 'phone_match',
          name_similarity: similarity(targetName, item.title ?? ''),
        }
      }
    }
  }

  if (items.length === 1) {
    // Single result — accept якщо хоча б weak similarity (existing permissive)
    const sim = similarity(targetName, items[0].title ?? '')
    return { match: items[0], override: null, name_similarity: sim }
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
  if (best && bestSim >= NAME_SIMILARITY_THRESHOLD) {
    return { match: best, override: null, name_similarity: bestSim }
  }
  return null
}

// ─── Public entry ───
// Sprint S-CEIDG-DETAILS Day 1 (15.05.2026) — wrapped з Promise.race для
// hard 30s ceiling. Внутрішня логіка (fetch + retry chain) залишається
// як було; outer race просто скорочує wall-clock budget якщо щось затягне
// (cold-start, 5xx retry chain, polling stuck). Public signature unchanged
// → 9 callers (route.ts, apify-batch.ts, scripts/smoke-test-apify, etc.)
// continue working без edits. Timeout return shape = zeroResult('partial',
// ...) — route.ts:696-712 уже handles partial без падіння.
export async function enrichContactsApify(
  apiKey: string,
  target: ApifyTarget,
): Promise<ApifyEnrichResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<ApifyEnrichResult>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(
        zeroResult(
          'partial',
          0,
          `APIFY_TIMEOUT_${Math.floor(APIFY_HARD_TIMEOUT_MS / 1000)}S — Apify exceeded ${APIFY_HARD_TIMEOUT_MS / 1000}s hard budget, skipped to protect Phase B (CEIDG_details + AI_business_analysis run next)`,
          { timeout: true, target_name: target.name ?? null, target_nip: target.nip ?? null },
        ),
      )
    }, APIFY_HARD_TIMEOUT_MS)
  })
  const result = await Promise.race([
    enrichContactsApifyInternal(apiKey, target),
    timeoutPromise,
  ])
  if (timeoutId !== undefined) clearTimeout(timeoutId)
  return result
}

async function enrichContactsApifyInternal(
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

  const picked = pickBestMatch(items, target.name, target.phone ?? null)
  if (!picked) {
    return zeroResult('no_match', cost, 'no result above similarity threshold', {
      query,
      items,
    })
  }

  const best = picked.match
  const phone = best.phone ?? best.phoneUnformatted ?? null
  const email = best.emails && best.emails.length > 0 ? best.emails[0] : null
  const website = best.website ?? null
  const gmaps_url = best.url ?? null
  const gmaps_rating = typeof best.totalScore === 'number' ? best.totalScore : null
  const gmaps_reviews_count =
    typeof best.reviewsCount === 'number' ? best.reviewsCount : null

  // Sprint S6D Day 2 REVISION — extract menu dishes (gmaps_extractor може
  // expose top 3-5 popular dishes). Defensive: try multiple known field names.
  const menu_dishes = extractMenuDishes(best)

  const hasContact = Boolean(phone || email || website)
  // Sprint S6C STEP 2 — якщо phone-match override triggered + name різниться
  // (similarity < 0.5), mark як 'partial' з note. Preserves valid contact
  // data навіть коли Google адрес ≠ DB адрес (різні locations of same NIP).
  let status: ApifyEnrichResult['status']
  let errorMessage: string | undefined
  if (picked.override === 'phone_match' && picked.name_similarity < NAME_SIMILARITY_THRESHOLD) {
    status = hasContact ? 'partial' : 'partial'
    errorMessage = `phone match override (name similarity ${picked.name_similarity.toFixed(2)} < ${NAME_SIMILARITY_THRESHOLD})`
  } else {
    status = hasContact ? 'success' : 'partial'
  }

  // Sprint S-DISCOVERY.1 (16.05.2026) — extract business_name з best.title
  // Gates: status='success' AND name_similarity >= 0.5. Skip коли phone-match
  // override (different location, brand may differ). Cleaning strips PL legal
  // forms + trailing city. business_category = Google verified category.
  const business_name =
    status === 'success' && picked.name_similarity >= NAME_SIMILARITY_THRESHOLD
      ? cleanBusinessName(best.title ?? '', target.city ?? null)
      : null
  const business_category = best.categoryName ?? null

  return {
    status,
    phone,
    email,
    website,
    gmaps_url,
    gmaps_rating,
    gmaps_reviews_count,
    menu_dishes,
    business_name,
    business_category,
    raw_payload: {
      query,
      best,
      all_results_count: items.length,
      pick_override: picked.override,
      name_similarity: picked.name_similarity,
      menu_dishes_count: menu_dishes.length,
    },
    cost_usd: Math.round(cost * 10000) / 10000,
    error_message: errorMessage,
  }
}

/** Sprint S6D Day 2 REVISION — best-effort price parse (PL format
 *  "12,50 zł" → 12.50). */
function parsePricePln(raw: number | string | null | undefined): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const cleaned = raw.replace(/[^\d,.\-]/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Sprint S-DISCOVERY.1 (16.05.2026) — clean Apify GMaps title для use as
 *  brand_aliases cascade entry. Strips:
 *    1. Polish legal forms: "Sp. z o.o.", "S.A.", "Spółka z ogr...", etc.
 *    2. Trailing city suffix (e.g. "Domek Sushi Piaseczno" → "Domek Sushi")
 *  Returns null коли empty after cleaning. */
function cleanBusinessName(rawTitle: string, city: string | null): string | null {
  if (!rawTitle?.trim()) return null
  let s = rawTitle.trim()
  // Strip PL legal forms (case-insensitive, anywhere — usually trailing)
  s = s.replace(/\s+(sp\.?\s*z\s*o\.?\s*o\.?|s\.?\s*a\.?|spółka\s+z\s+ograniczoną\s+odpowiedzialnością)\.?$/iu, '')
  // Strip 1 inner "Sp. z o.o." якщо followed by suffix (e.g. "Foo Sp. z o.o. Warszawa")
  s = s.replace(/\s+(sp\.?\s*z\s*o\.?\s*o\.?|s\.?\s*a\.?|spółka\s+z\s+ograniczoną\s+odpowiedzialnością)\.?\s+/iu, ' ')
  // Strip trailing city (case-insensitive, with optional comma)
  if (city) {
    const cityEscaped = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    s = s.replace(new RegExp(`[,\\s]+${cityEscaped}\\s*$`, 'iu'), '')
  }
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > 0 ? s : null
}

/** Defensive menu extraction — actor schema for menus undocumented.
 *  Try multiple known field names. Returns empty array якщо no menu present. */
function extractMenuDishes(place: ApifyPlace): ApifyMenuDish[] {
  const candidates =
    place.menu ?? place.menuItems ?? place.popularDishes ?? place.dishes ?? []
  const out: ApifyMenuDish[] = []
  for (const it of candidates) {
    const name = it.name ?? it.title ?? ''
    if (!name.trim()) continue
    out.push({
      name_pl: name.trim(),
      price_pln: parsePricePln(it.price ?? it.priceText ?? null),
      description: it.description ?? null,
      image_url: it.imageUrl ?? it.image ?? null,
    })
  }
  return out
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
    menu_dishes: [],
    business_name: null,
    business_category: null,
    raw_payload: raw ?? null,
    cost_usd: Math.round(cost * 10000) / 10000,
    error_message: error,
  }
}
