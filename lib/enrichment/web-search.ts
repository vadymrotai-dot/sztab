// lib/enrichment/web-search.ts
// Sprint L Phase 2 — Tavily AI web search integration.
//
// API: POST https://api.tavily.com/search
// Body: { api_key, query, search_depth, max_results, include_answer }
// Response: { results: [{title, url, content, score, published_date}] }
//
// Free tier: 1000 searches/month. Cost not exposed in response — track
// approximate cost ~$0.005 per search (basic) or $0.01 (advanced).
//
// API key: TAVILY_API_KEY у env (process.env). Configured у Vercel
// production+preview. Locally — add до .env.local manually для dev.

const TAVILY_BASE = 'https://api.tavily.com'
const REQUEST_TIMEOUT_MS = 25_000
const COST_PER_BASIC_SEARCH_USD = 0.005

/** Sprint M FIX 6 + Sprint S2A Phase 2 — PL business directory /
 *  aggregator domains. Tavily ranks ich highly bo content quality, але
 *  це не company website. Match tested via host.includes() — handle
 *  subdomains та variations. */
export const AGGREGATOR_BLOCKLIST = [
  // Job aggregators (Sprint S2A added)
  'gowork.pl',
  'pracuj.pl',
  'olx.pl',
  'indeed.pl',
  // KRS / business registries
  'krs-pobierz.pl',
  'panoramafirm.pl',
  'aleo.com',
  'aleobiznes.pl',
  'biznesfinder.pl',
  'mojepanstwo.pl',
  'bisnode.pl',
  'rzetelnafirma.pl',
  'msig.pl',
  'imsig.pl',
  'rejestrio.pl',
  'rejestr.io',
  'krs.pl',
  'firmy.net',
  'pkt.pl',
  'biznesradar.pl',
  // Government directories (Sprint S2A added — catch any *.gov.pl
  // aggregator outside of registered API endpoints)
  'bzp.uzp.gov.pl',
  'ezamowienia.gov.pl',
  'ceidg.gov.pl',
  'ekrs.ms.gov.pl',
  'mfa.gov.pl',
  'gov.pl',
  // Sprint S-MENU Day 3 (15.05.2026) — caught у MARCIN BOROWY live audit.
  // Tavily picked monitorfirm.pb.pl + yelp.com як "company website",
  // overwriting real kemerkebab.pl у company_profile_fields. Expanded
  // blocklist з PL B2B aggregators + global review/listing sites.
  // Polish B2B / monitoring aggregators
  'monitorfirm.pb.pl',
  'pb.pl', // Puls Biznesu root (catches monitorfirm subdomain + others)
  'firmy.wp.pl',
  'bizpolska.pl',
  'kompass.com',
  'nportal.pl',
  'fakty.pl',
  'opineo.pl',
  'goldenline.pl',
  'znajdz-firme.pl',
  'mapy.pb.pl',
  'branzeinfo.pl',
  // Global review / listing aggregators
  'yelp.com',
  'yelp.pl',
  'tripadvisor.com',
  'tripadvisor.pl',
  'foursquare.com',
  'yellowpages.com',
]

export function isAggregator(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '')
  return AGGREGATOR_BLOCKLIST.some((b) => h === b || h.endsWith('.' + b))
}

/** Sprint S2A Phase 2 — accepts full URL (extracts hostname). */
export function isAggregatorUrl(url: string): boolean {
  try {
    return isAggregator(new URL(url).hostname)
  } catch {
    return false
  }
}

export interface NewsMention {
  title: string
  url: string
  snippet: string
  published_at: string | null
  score: number
}

export interface WebSearchResult {
  website_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  google_maps_urls: string[]
  news_mentions: NewsMention[]
  raw_results: TavilyResult[]
  search_cost_usd: number
  /** Sprint S6C STEP 2 (11.05.2026) — surface API errors to caller.
   *  null = всі queries succeeded; string = aggregate error message. */
  error: string | null
  /** Status decision: 'success' = items found; 'partial' = HTTP 200 але
   *  0 items; 'error' = всі queries failed (network/auth/quota). */
  status: 'success' | 'partial' | 'error'
}

interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
  published_date?: string
}

interface TavilyResponse {
  query: string
  answer?: string
  results: TavilyResult[]
}

interface TavilyCallResult {
  success: boolean
  response: TavilyResponse | null
  error: string | null
  http_status: number
}

async function tavilySearch(
  apiKey: string,
  query: string,
  maxResults = 8,
): Promise<TavilyCallResult> {
  let res: Response
  try {
    res = await fetch(`${TAVILY_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: false,
        // Sprint S6C STEP 2 (11.05.2026) — REMOVED country: 'pl' parameter.
        // Probe з 11.05 показав HTTP 400 "Invalid country. Must be a valid
        // country name from list of supported countries". Tavily expects
        // full English country names (наприклад "Poland", не ISO codes).
        // Omitting parameter — uses Tavily defaults (global з PL-relevance
        // ranking, perfectly OK for our use case оскільки query encoder
        // includes Polish-specific terms like NIP/sklep/firma).
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Tavily] network error:', msg)
    return { success: false, response: null, error: `network: ${msg}`, http_status: 0 }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const errMsg = `HTTP ${res.status}: ${body.slice(0, 200)}`
    console.error(`[Tavily] ${errMsg}`)
    return { success: false, response: null, error: errMsg, http_status: res.status }
  }
  try {
    const json = (await res.json()) as TavilyResponse
    return { success: true, response: json, error: null, http_status: res.status }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, response: null, error: `parse: ${msg}`, http_status: res.status }
  }
}

function categorizeUrl(
  url: string,
  ownDomain: string | null,
): { kind: 'website' | 'facebook' | 'instagram' | 'gmaps' | 'news' | 'other' | 'aggregator' } {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return { kind: 'other' }
  }
  // Sprint M FIX 6: aggregator filter applied перш ніж anything else
  if (isAggregator(host)) return { kind: 'aggregator' }
  if (host.includes('facebook.com')) return { kind: 'facebook' }
  if (host.includes('instagram.com')) return { kind: 'instagram' }
  if (host.includes('maps.google') || host === 'goo.gl' || host.includes('google.com/maps'))
    return { kind: 'gmaps' }
  if (ownDomain && host.endsWith(ownDomain)) return { kind: 'website' }
  // News-like: typical PL news outlets
  if (
    host.includes('forbes') ||
    host.includes('puls') ||
    host.includes('rzeczpospolita') ||
    host.includes('biznes') ||
    host.includes('wyborcza') ||
    host.includes('money')
  ) {
    return { kind: 'news' }
  }
  return { kind: 'other' }
}

function guessOwnDomain(name: string, results: TavilyResult[]): string | null {
  // Heuristic: domain mentioned 2+ times across results (skip social/maps/aggregators)
  const counts = new Map<string, number>()
  for (const r of results) {
    try {
      const host = new URL(r.url).hostname.toLowerCase().replace(/^www\./, '')
      if (host.includes('facebook') || host.includes('instagram') || host.includes('google'))
        continue
      if (host.includes('linkedin') || host.includes('youtube')) continue
      // Sprint M FIX 6 — aggregators rank high but never represent company.
      if (isAggregator(host)) continue
      counts.set(host, (counts.get(host) ?? 0) + 1)
    } catch {}
  }
  // Sort by frequency, prefer domain з name fragment
  const slug = name.toLowerCase().replace(/[^a-z]/g, '')
  let best: string | null = null
  let bestScore = 0
  for (const [host, count] of counts) {
    let score = count
    if (slug && host.replace(/[^a-z]/g, '').includes(slug.slice(0, 6))) score += 5
    if (score > bestScore) {
      bestScore = score
      best = host
    }
  }
  return best && bestScore >= 2 ? best : null
}

export async function searchCompanyOnline(
  apiKey: string,
  nazwa: string,
  nip: string,
): Promise<WebSearchResult> {
  const out: WebSearchResult = {
    website_url: null,
    facebook_url: null,
    instagram_url: null,
    google_maps_urls: [],
    news_mentions: [],
    raw_results: [],
    search_cost_usd: 0,
    error: null,
    status: 'partial',
  }

  if (!apiKey) {
    console.warn('[web-search] TAVILY_API_KEY missing — returning empty')
    out.error = 'TAVILY_API_KEY missing'
    out.status = 'error'
    return out
  }
  if (!nazwa) {
    out.error = 'name empty'
    out.status = 'error'
    return out
  }

  // Sprint S6C STEP 2: short-name fallback. Strip "SP. Z O.O." suffix —
  // Tavily indexing prefers natural names. NIP query plus short variant.
  const shortName = nazwa
    .replace(
      /\s+SP[ÓO]ŁKA\s+Z\s+OGRANICZON[AĄ]\s+ODPOWIEDZIALNOŚCI[AĄ]?$/i,
      '',
    )
    .replace(/\s+SP\.?\s*Z\s*O\.?\s*O\.?$/i, '')
    .replace(/\s+S\.?\s*A\.?$/i, '')
    .trim()

  // Sprint S-CEIDG-DETAILS Day 1 (15.05.2026): 3rd query targets regulamin/
  // polityka pages where NIP listed as partner. +$0.005 per analysis.
  // Query 1 broadened: +restauracja/gastronomia keywords для gastronomy
  // JDG/sp.z o.o. (previously missed; е.g. JDG-kebabnia not indexed via
  // "sklep OR sieć OR firma OR hurtownia" — gastronomia keywords now caught).
  const queries = [
    `"${shortName}" sklep OR sieć OR firma OR hurtownia OR restauracja OR gastronomia`,
    `"${shortName}" ${nip}`,
    `"${nip}" regulamin OR "polityka prywatności" OR "podmiot partnerski"`,
  ]
  let allResults: TavilyResult[] = []
  const errors: string[] = []
  let anySucceeded = false
  for (const q of queries) {
    const result = await tavilySearch(apiKey, q, 6)
    if (result.success && result.response) {
      anySucceeded = true
      allResults = allResults.concat(result.response.results ?? [])
      out.search_cost_usd += COST_PER_BASIC_SEARCH_USD
    } else if (result.error) {
      errors.push(`q="${q.slice(0, 40)}…": ${result.error}`)
    }
  }
  out.raw_results = allResults

  // Sprint S6C STEP 2: surface errors + status decision.
  // - All queries failed → status='error' з aggregate message
  // - Some succeeded але 0 items → status='partial' (Tavily не indexed)
  // - Items returned → status='success'
  if (!anySucceeded) {
    out.error = errors.join(' | ')
    out.status = 'error'
    return out
  }
  if (allResults.length === 0) {
    out.error =
      errors.length > 0
        ? `Some queries failed: ${errors.join(' | ')}`
        : 'Tavily returned 0 results across all queries'
    out.status = 'partial'
    return out
  }
  out.status = 'success'

  const ownDomain = guessOwnDomain(nazwa, allResults)

  // Categorize URLs
  for (const r of allResults) {
    const cat = categorizeUrl(r.url, ownDomain)
    switch (cat.kind) {
      case 'website':
        if (!out.website_url) {
          try {
            const u = new URL(r.url)
            out.website_url = `${u.protocol}//${u.host}`
          } catch {}
        }
        break
      case 'facebook':
        if (!out.facebook_url) out.facebook_url = r.url
        break
      case 'instagram':
        if (!out.instagram_url) out.instagram_url = r.url
        break
      case 'gmaps':
        if (out.google_maps_urls.length < 5) out.google_maps_urls.push(r.url)
        break
      case 'news':
        if (out.news_mentions.length < 5) {
          out.news_mentions.push({
            title: r.title,
            url: r.url,
            snippet: r.content.slice(0, 280),
            published_at: r.published_date ?? null,
            score: r.score,
          })
        }
        break
    }
  }

  // Fallback website detection: no explicit category match але own domain detected.
  // Sprint M FIX 6 — defensive double-check, ownDomain already excludes aggregators.
  if (!out.website_url && ownDomain && !isAggregator(ownDomain)) {
    out.website_url = `https://${ownDomain}`
  }

  return out
}

// ─── Sprint S-MENU Day 3 (15.05.2026) — Brand-aware Tavily fallback ───
// Why: для JDG-gastronomy clients where CEIDG koncesja provides brand name
// (e.g. "KEMER KEBAB" from uprawnienia.opis), generic Tavily query (NIP +
// "firma sklep") picks aggregators (monitorfirm.pb.pl, yelp). Brand-aware
// re-query targets "${brand} ${city} menu OR jadlospis site:.pl" —
// strongly biased toward real restaurant сайту з menu (e.g. kemerkebab.pl).
//
// Strategy:
//   1. Tavily query з brand + city + menu/oferta keywords + site:.pl
//   2. Filter results через AGGREGATOR_BLOCKLIST
//   3. Score candidates: domain контаining brand slug substring boosts +5
//   4. Return best-scoring non-aggregator domain
//
// Outer Promise.race(15s) — захист Phase B budget.
export interface BrandSearchResult {
  website_url: string | null
  search_cost_usd: number
  candidates_considered: number
  error: string | null
  status: 'success' | 'partial' | 'error'
}

const BRAND_SEARCH_TIMEOUT_MS = 15_000

function normalizeBrandSlug(brand: string): string {
  return brand
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]/g, '')
}

async function searchCompanyByBrandInternal(
  brand: string,
  city: string | null,
  tavilyApiKey: string,
): Promise<BrandSearchResult> {
  const out: BrandSearchResult = {
    website_url: null,
    search_cost_usd: 0,
    candidates_considered: 0,
    error: null,
    status: 'partial',
  }
  if (!tavilyApiKey) {
    out.error = 'TAVILY_API_KEY missing'
    out.status = 'error'
    return out
  }
  if (!brand?.trim()) {
    out.error = 'brand empty'
    out.status = 'error'
    return out
  }

  // Query targeted на real restaurant sites (menu/oferta keywords PL),
  // bound to .pl ccTLD (most kebabnia/gastronomia)
  const cityPart = city ? ` ${city}` : ''
  const query = `"${brand}"${cityPart} menu OR oferta OR jadlospis site:.pl`

  const tavilyResult = await tavilySearch(tavilyApiKey, query, 8)
  if (!tavilyResult.success || !tavilyResult.response) {
    out.error = tavilyResult.error ?? 'tavily call failed'
    out.status = 'error'
    return out
  }
  out.search_cost_usd = COST_PER_BASIC_SEARCH_USD
  const results = tavilyResult.response.results ?? []
  out.candidates_considered = results.length

  // Score each candidate: filter aggregators, boost domain-contains-brand
  const brandSlug = normalizeBrandSlug(brand)
  let best: { url: string; score: number } | null = null
  for (const r of results) {
    let host: string
    try {
      host = new URL(r.url).hostname.toLowerCase().replace(/^www\./, '')
    } catch {
      continue
    }
    if (isAggregator(host)) continue
    // Social media — не company website
    if (
      host.includes('facebook.com') ||
      host.includes('instagram.com') ||
      host.includes('linkedin.com') ||
      host.includes('youtube.com') ||
      host.includes('tiktok.com') ||
      host.includes('twitter.com') ||
      host.includes('x.com')
    ) continue
    // Google Maps / search aggregator
    if (host.includes('google.com') || host.includes('goo.gl')) continue

    let score = typeof r.score === 'number' ? r.score : 0.5
    const hostSlug = host.replace(/[^a-z0-9]/g, '')
    if (brandSlug.length >= 4 && hostSlug.includes(brandSlug.slice(0, 6))) {
      score += 5 // strong boost — domain contains brand
    }
    // Tavily score range typically 0-1; brand bonus dominates коли it fires
    if (!best || score > best.score) {
      try {
        const u = new URL(r.url)
        best = { url: `${u.protocol}//${u.host}`, score }
      } catch {
        continue
      }
    }
  }

  if (best) {
    out.website_url = best.url
    out.status = 'success'
  } else {
    out.error = `no non-aggregator results matching brand "${brand}"`
    out.status = 'partial'
  }
  return out
}

/** Public entry. Hard 15s ceiling via Promise.race. Returns brand-matched
 *  website URL OR null. Use коли brand_aliases populated (post-CEIDG step)
 *  AND current website missing/aggregator. */
export async function searchCompanyByBrand(
  brand: string,
  city: string | null,
  tavilyApiKey: string,
): Promise<BrandSearchResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<BrandSearchResult>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        website_url: null,
        search_cost_usd: 0,
        candidates_considered: 0,
        error: `BRAND_SEARCH_TIMEOUT_${Math.floor(BRAND_SEARCH_TIMEOUT_MS / 1000)}S`,
        status: 'partial',
      })
    }, BRAND_SEARCH_TIMEOUT_MS)
  })
  const result = await Promise.race([
    searchCompanyByBrandInternal(brand, city, tavilyApiKey),
    timeoutPromise,
  ])
  if (timeoutId !== undefined) clearTimeout(timeoutId)
  return result
}
