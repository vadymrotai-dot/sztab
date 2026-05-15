// lib/enrichment/restaumatic-menu.ts
// Sprint S-MENU Day 2 (15.05.2026) — Restaumatic JSON-LD menu extractor.
//
// Why це critical: Restaumatic is dominant Polish gastronomy ordering platform
// (~30-50% market share). Sites like kemerkebab.pl, many sushi bars, pizzerias
// expose **complete schema.org Restaurant JSON-LD з hasMenu** inline у HTML
// (server-rendered, NO JS needed). Це extraction goldmine — zero AI cost,
// structured prices/sections/descriptions, faster than Apify GMaps.
//
// Strategy (Vadym evidence-driven, 15.05.2026):
//   1. Parallel fetch [homepage, /sitemap.xml] — 12s timeout each
//   2. Detect "restaumatic" signature у homepage HTML (case-insensitive)
//      Якщо НЕ Restaumatic → return 'not_restaumatic' fast (caller fallback)
//   3. Якщо homepage JSON-LD має hasMenu — parse там
//   4. Інакше — extract /restauracja/{slug} URLs з sitemap, fetch FIRST,
//      parse its JSON-LD blocks, find one з hasMenu
//   5. Walk hasMenuSection[].hasMenuItem[] → emit dishes
//
// Outer Promise.race(20s) safety net — protects Phase B budget proти
// edge cases (multiple JSON-LD blocks, slow sitemap, etc.).
//
// Live evidence (kemerkebab.pl, 15.05.2026):
//   - Homepage = chain landing, 2 JSON-LD blocks, NO hasMenu (ServiceArea only)
//   - /sitemap.xml: 29 URLs, 3 з /restauracja/ pattern
//   - First /restauracja/* page: 41 dishes, 7 sections, full metadata
//
// Cost: $0 (no AI, no Apify, only HTTP fetches).

const FETCH_TIMEOUT_MS = 12_000
const OUTER_TIMEOUT_MS = 20_000
const MAX_HTML_BYTES = 400_000 // restaurant pages ~250KB, headroom для safety

export interface RestaumaticDish {
  name: string
  description: string | null
  price_pln: number | null
  section: string | null
}

export interface RestaumaticMenuResult {
  status: 'success' | 'partial' | 'error' | 'not_restaumatic'
  source_url: string | null
  restaurant_name: string | null
  dishes: RestaumaticDish[]
  aggregate_rating: { value: number; count: number } | null
  geo: { lat: number; lng: number } | null
  address: string | null
  telephone: string | null
  email: string | null
  opening_hours: string[] | null
  error?: string
}

function emptyResult(
  status: RestaumaticMenuResult['status'],
  error?: string,
  sourceUrl: string | null = null,
): RestaumaticMenuResult {
  return {
    status,
    source_url: sourceUrl,
    restaurant_name: null,
    dishes: [],
    aggregate_rating: null,
    geo: null,
    address: null,
    telephone: null,
    email: null,
    opening_hours: null,
    error,
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Sztab/1.0; +mailto:vadymrotai@gmail.com)',
        Accept: 'text/html,application/xhtml+xml,application/xml',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.length > MAX_HTML_BYTES ? text.slice(0, MAX_HTML_BYTES) : text
  } catch {
    return null
  }
}

/** Detect Restaumatic signature у HTML. Live evidence: kemerkebab.pl has
 *  "restaumatic" lowercase substring (in image URLs, sentry tag, app meta).
 *  Bulletproof match — full chains use restaumatic-production.imgix.net CDN. */
function isRestaumaticSite(html: string): boolean {
  return html.toLowerCase().includes('restaumatic')
}

/** Extract `<script type="application/ld+json">...</script>` blocks. */
function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const raw = match[1].trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      blocks.push(parsed)
    } catch {
      // skip malformed JSON-LD
    }
  }
  return blocks
}

interface JsonLdNode {
  '@type'?: string | string[]
  '@graph'?: unknown[]
  hasMenu?: unknown
  name?: string
  telephone?: string
  email?: string
  address?: unknown
  geo?: unknown
  aggregateRating?: unknown
  openingHoursSpecification?: unknown
  openingHours?: string[]
  [key: string]: unknown
}

function typeMatches(node: JsonLdNode, target: string): boolean {
  const t = node['@type']
  if (!t) return false
  if (typeof t === 'string') return t === target
  if (Array.isArray(t)) return t.includes(target)
  return false
}

/** Walk JSON-LD blocks (handles @graph wrapping, arrays of nodes) —
 *  return first node з @type=Restaurant + hasMenu. */
function findRestaurantNode(blocks: unknown[]): JsonLdNode | null {
  const candidates: JsonLdNode[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const n of node) walk(n)
      return
    }
    const obj = node as JsonLdNode
    if (Array.isArray(obj['@graph'])) {
      for (const n of obj['@graph']) walk(n)
    }
    if (typeMatches(obj, 'Restaurant') || typeMatches(obj, 'FoodEstablishment')) {
      candidates.push(obj)
    }
  }
  for (const b of blocks) walk(b)
  // Prefer Restaurant з hasMenu (Vadym evidence: 2 blocks per page, only ONE has hasMenu)
  const withMenu = candidates.find((c) => c.hasMenu)
  if (withMenu) return withMenu
  return candidates[0] ?? null
}

function parsePrice(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[^\d,.\-]/g, '').replace(',', '.')
    const n = parseFloat(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

interface MenuItemNode {
  name?: string
  description?: string
  offers?: unknown
}
interface MenuSectionNode {
  name?: string
  hasMenuItem?: unknown
}

function extractOfferPrice(offers: unknown): number | null {
  if (!offers) return null
  const candidate = Array.isArray(offers) ? offers[0] : offers
  if (!candidate || typeof candidate !== 'object') return null
  const obj = candidate as { price?: unknown; lowPrice?: unknown }
  return parsePrice(obj.price ?? obj.lowPrice ?? null)
}

function decodeText(s: string | undefined | null): string | null {
  if (!s || typeof s !== 'string') return null
  const trimmed = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return trimmed.length > 0 ? trimmed : null
}

function extractDishesFromMenu(hasMenu: unknown): RestaumaticDish[] {
  if (!hasMenu || typeof hasMenu !== 'object') return []
  const menuObj = hasMenu as { hasMenuSection?: unknown; hasMenuItem?: unknown }
  const sections: MenuSectionNode[] = []
  // Some Restaumatic emit hasMenuSection (sectioned), others hasMenuItem (flat)
  if (Array.isArray(menuObj.hasMenuSection)) {
    sections.push(...(menuObj.hasMenuSection as MenuSectionNode[]))
  } else if (Array.isArray(menuObj.hasMenuItem)) {
    sections.push({ name: undefined, hasMenuItem: menuObj.hasMenuItem })
  }
  const out: RestaumaticDish[] = []
  for (const section of sections) {
    const sectionName = decodeText(section.name)
    const items = Array.isArray(section.hasMenuItem) ? section.hasMenuItem : []
    for (const itRaw of items) {
      if (!itRaw || typeof itRaw !== 'object') continue
      const it = itRaw as MenuItemNode
      const name = decodeText(it.name)
      if (!name) continue
      out.push({
        name,
        description: decodeText(it.description),
        price_pln: extractOfferPrice(it.offers),
        section: sectionName,
      })
    }
  }
  return out
}

function extractMeta(node: JsonLdNode): Pick<
  RestaumaticMenuResult,
  'restaurant_name' | 'aggregate_rating' | 'geo' | 'address' | 'telephone' | 'email' | 'opening_hours'
> {
  let geo: RestaumaticMenuResult['geo'] = null
  if (node.geo && typeof node.geo === 'object') {
    const g = node.geo as { latitude?: unknown; longitude?: unknown }
    const lat = typeof g.latitude === 'number' ? g.latitude : parseFloat(String(g.latitude ?? ''))
    const lng = typeof g.longitude === 'number' ? g.longitude : parseFloat(String(g.longitude ?? ''))
    if (Number.isFinite(lat) && Number.isFinite(lng)) geo = { lat, lng }
  }
  let address: string | null = null
  if (node.address && typeof node.address === 'object') {
    const a = node.address as {
      streetAddress?: string
      postalCode?: string
      addressLocality?: string
    }
    const parts = [a.streetAddress, a.postalCode, a.addressLocality].filter(Boolean) as string[]
    if (parts.length > 0) address = parts.join(', ')
  }
  let aggregate_rating: RestaumaticMenuResult['aggregate_rating'] = null
  if (node.aggregateRating && typeof node.aggregateRating === 'object') {
    const r = node.aggregateRating as { ratingValue?: unknown; ratingCount?: unknown }
    const value = typeof r.ratingValue === 'number' ? r.ratingValue : parseFloat(String(r.ratingValue ?? ''))
    const count = typeof r.ratingCount === 'number' ? r.ratingCount : parseInt(String(r.ratingCount ?? ''), 10)
    if (Number.isFinite(value) && Number.isFinite(count)) {
      aggregate_rating = { value, count }
    }
  }
  let opening_hours: string[] | null = null
  if (Array.isArray(node.openingHours) && node.openingHours.length > 0) {
    opening_hours = node.openingHours.filter((s): s is string => typeof s === 'string' && s.length > 0)
    if (opening_hours.length === 0) opening_hours = null
  }
  return {
    restaurant_name: decodeText(node.name),
    aggregate_rating,
    geo,
    address,
    telephone: decodeText(node.telephone),
    email: decodeText(node.email),
    opening_hours,
  }
}

/** Extract first /restauracja/{slug} URL з sitemap XML.
 *  Sitemap shape: <loc>https://host.pl/restauracja/slug</loc> per Vadym probe. */
function extractFirstRestauracjaUrl(sitemapXml: string, baseHost: string): string | null {
  const re = /<loc>(https?:\/\/[^<]+\/restauracja\/[^<]+)<\/loc>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(sitemapXml)) !== null) {
    const url = match[1]
    try {
      const u = new URL(url)
      // Prefer same-host (avoid cross-domain sitemap entries)
      if (u.hostname === baseHost || u.hostname.endsWith(baseHost)) return url
    } catch {
      continue
    }
  }
  return null
}

async function tryParseJsonLdFromHtml(
  html: string,
  sourceUrl: string,
): Promise<RestaumaticMenuResult | null> {
  const blocks = extractJsonLdBlocks(html)
  if (blocks.length === 0) return null
  const node = findRestaurantNode(blocks)
  if (!node || !node.hasMenu) return null
  const dishes = extractDishesFromMenu(node.hasMenu)
  if (dishes.length === 0) return null
  const meta = extractMeta(node)
  return {
    status: 'success',
    source_url: sourceUrl,
    dishes,
    ...meta,
  }
}

/** Inner extraction — runs під Promise.race(20s) outer guard. */
async function extractRestaumaticInternal(websiteUrl: string): Promise<RestaumaticMenuResult> {
  let baseUrl: URL
  try {
    baseUrl = new URL(websiteUrl)
  } catch {
    return emptyResult('error', `invalid URL: ${websiteUrl.slice(0, 80)}`)
  }
  const origin = baseUrl.origin
  const homepageUrl = origin + '/'
  const sitemapUrl = origin + '/sitemap.xml'

  // Parallel fetch [homepage, sitemap] — both bounded by FETCH_TIMEOUT_MS
  const [homepageRes, sitemapRes] = await Promise.allSettled([
    fetchText(homepageUrl),
    fetchText(sitemapUrl),
  ])
  const homepageHtml = homepageRes.status === 'fulfilled' ? homepageRes.value : null
  const sitemapXml = sitemapRes.status === 'fulfilled' ? sitemapRes.value : null

  if (!homepageHtml) {
    return emptyResult('error', 'homepage fetch failed', homepageUrl)
  }

  // Restaumatic detection FIRST (per Vadym constraint: before UpMenu false-positive)
  if (!isRestaumaticSite(homepageHtml)) {
    return emptyResult('not_restaumatic', undefined, homepageUrl)
  }

  // Try homepage JSON-LD (single-location restaurants embed full hasMenu там)
  const homepageResult = await tryParseJsonLdFromHtml(homepageHtml, homepageUrl)
  if (homepageResult) return homepageResult

  // Homepage = chain landing → use sitemap to find a /restauracja/{slug} page
  if (!sitemapXml) {
    return emptyResult(
      'partial',
      'Restaumatic detected, але homepage без hasMenu AND sitemap.xml unavailable',
      homepageUrl,
    )
  }
  const restauracjaUrl = extractFirstRestauracjaUrl(sitemapXml, baseUrl.hostname)
  if (!restauracjaUrl) {
    return emptyResult(
      'partial',
      'Restaumatic detected, але sitemap НЕ містить /restauracja/ URLs',
      sitemapUrl,
    )
  }
  const restauracjaHtml = await fetchText(restauracjaUrl)
  if (!restauracjaHtml) {
    return emptyResult('partial', 'restaurant page fetch failed', restauracjaUrl)
  }
  const restauracjaResult = await tryParseJsonLdFromHtml(restauracjaHtml, restauracjaUrl)
  if (restauracjaResult) return restauracjaResult
  return emptyResult(
    'partial',
    'Restaumatic detected, restaurant page fetched, але JSON-LD НЕ містив hasMenu з dishes',
    restauracjaUrl,
  )
}

/** Public entry. Hard 20s ceiling via Promise.race. Returns 'not_restaumatic'
 *  fast (single homepage fetch + signature check) для non-Restaumatic sites
 *  — caller fallbacks до existing path-walking logic. */
export async function extractRestaumaticMenu(
  websiteUrl: string,
): Promise<RestaumaticMenuResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<RestaumaticMenuResult>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(
        emptyResult(
          'partial',
          `RESTAUMATIC_TIMEOUT_${Math.floor(OUTER_TIMEOUT_MS / 1000)}S — extraction exceeded ${OUTER_TIMEOUT_MS / 1000}s budget`,
        ),
      )
    }, OUTER_TIMEOUT_MS)
  })
  const result = await Promise.race([
    extractRestaumaticInternal(websiteUrl),
    timeoutPromise,
  ])
  if (timeoutId !== undefined) clearTimeout(timeoutId)
  return result
}
