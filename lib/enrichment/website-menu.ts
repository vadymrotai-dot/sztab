// lib/enrichment/website-menu.ts
// Sprint S6D Day 2 REVISION (12.05.2026) — fetch menu pages з własnego
// website restauracji + AI parse → dishes JSON.
//
// Why це critical: Vadym verified through Chrome MCP что Domek Sushi own
// site (domeksushi.pl/menu) має повний menu in HTML; Google Maps profile
// рендертить тільки top 3-5 popular dishes; Pyszne actor returns UK
// Subway data (немає PL Pyszne actor у Apify Store). WWW direct fetch =
// найбільш reliable source for full menu.
//
// Strategy:
//   1. Try multiple paths: /menu, /jadlospis, /oferta, /karta, /menus,
//      /food, /dishes, /karta-dan, /jadlospis-dnia
//   2. Якщо HTML — strip to text → AI extract dishes
//   3. Якщо PDF — defer (Day 3+ unpdf integration)
//   4. Save dishes до contact_enrichment з source='www_menu'
//
// Cost ~$0.005 per restaurant (HTML fetch free + Haiku ~500 input + ~800
// output tokens = 500*1.0/1M + 800*5.0/1M = $0.0045).
//
// Sprint S6D Day 3 (12.05.2026) — extended з:
//   - UpMenu iframe detection (>50% Polish gastronomia uses UpMenu —
//     architectural blocker для server-side scraping). Якщо HTML body
//     містить `cs.cdn-upm.com` AND content sparse → skip з source=
//     'upmenu_blocked'. Caller fallbacks до GMaps popular_dishes.
//   - PDF wedo path: якщо response content-type='application/pdf' →
//     invoke wedo_software/wedo-scrape-menu actor on PDF URL. Validated
//     на Pizza Na Wypasie (~$0.10, dishes з allergen codes via OCR).
//   - Result.source enum tells UI which path produced dishes.

import { callAI, AI_MODELS, extractJSON } from '@/lib/ai-providers'
// Sprint S-MENU Day 2 (15.05.2026) — Restaumatic JSON-LD fast path.
// Restaumatic powers ~30-50% PL gastronomia; sites embed full schema.org
// Restaurant з hasMenu inline у HTML. NO AI cost, ZERO Apify dependency.
// MUST be tried PERSE UpMenu detector (Restaumatic + UpMenu false-positive
// risk у footer scripts).
import { extractRestaumaticMenu } from '@/lib/enrichment/restaumatic-menu'

const MENU_PATHS = [
  '/menu',
  '/jadlospis',
  '/oferta',
  '/karta',
  '/menus',
  '/food',
  '/dishes',
  '/karta-dan',
  '/jadlospis-dnia',
] as const
const FETCH_TIMEOUT_MS = 12_000
const MAX_HTML_PER_PAGE = 200_000 // menu pages can be larger than /kontakt
const MAX_TOTAL_TEXT = 60_000

export interface WebsiteMenuDish {
  name_pl: string
  price_pln: number | null
  category: string | null
  description: string | null
  confidence: number
}

export interface WebsiteMenuExtractResult {
  url: string
  matched_path: string | null
  pages_fetched: string[]
  content_type: 'html' | 'pdf' | 'unknown' | null
  /** Sprint S6D Day 3 — track which extraction path produced dishes,
   *  exposed do UI для transparency.
   *  - 'restaumatic_jsonld': Sprint S-MENU Day 2 — Restaumatic platform
   *     detected, JSON-LD з hasMenu parsed inline (no AI, no Apify)
   *  - 'static_html_ai': existing path (HTML → AI Haiku)
   *  - 'pdf_wedo': PDF detected → wedo_software actor OCR
   *  - 'upmenu_blocked': UpMenu iframe detected → no extraction (defer to GMaps)
   *  - 'no_match': no path returned dishes
   *  - 'error': fatal */
  source:
    | 'restaumatic_jsonld'
    | 'static_html_ai'
    | 'pdf_wedo'
    | 'upmenu_blocked'
    | 'no_match'
    | 'error'
  dishes: WebsiteMenuDish[]
  cost_usd: number
  error?: string
}

/** Sprint S6D Day 3 — UpMenu signature patterns (CDN + iframe markers).
 *  Restaurants з UpMenu host menu via JavaScript widget loaded з
 *  cs.cdn-upm.com OR upmenu.com — server-side fetch returns shell HTML
 *  без real menu DOM. Detect → skip (no point burning AI cost). */
const UPMENU_SIGNATURES = [
  'cs.cdn-upm.com',
  'upmenu.com',
  'cdn-upm.com',
  'data-upmenu',
  '_upmenu',
] as const
const UPMENU_MIN_MEANINGFUL_CHARS = 500

function detectUpMenu(html: string): boolean {
  const lower = html.toLowerCase()
  const hasSignature = UPMENU_SIGNATURES.some((sig) => lower.includes(sig))
  if (!hasSignature) return false
  // Якщо signature present — verify HTML body sparse (iframe shell, не
  // real menu page). Якщо актор somehow rendered full HTML — accept як
  // valid menu source.
  const stripped = stripHtml(html)
  return stripped.length < UPMENU_MIN_MEANINGFUL_CHARS
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

interface FetchResult {
  html: string
  contentType: 'html' | 'pdf' | 'unknown'
  finalUrl: string  // Sprint S6D Day 3 — needed для PDF actor handoff
}

async function fetchPage(url: string): Promise<FetchResult | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Sztab/1.0; +mailto:vadymrotai@gmail.com)',
        Accept: 'text/html,application/xhtml+xml,application/pdf',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const ct = (res.headers.get('content-type') ?? '').toLowerCase()
    let contentType: FetchResult['contentType']
    if (ct.includes('pdf')) contentType = 'pdf'
    else if (ct.includes('html') || ct.includes('xml')) contentType = 'html'
    else contentType = 'unknown'

    if (contentType === 'pdf') {
      // Sprint S6D Day 3 — return marker з finalUrl (после redirect resolve)
      // — використовується для wedo PDF call.
      return { html: '', contentType, finalUrl: res.url }
    }
    const text = await res.text()
    return { html: text.slice(0, MAX_HTML_PER_PAGE), contentType, finalUrl: res.url }
  } catch {
    return null
  }
}

// ─── Sprint S6D Day 3 — Wedo PDF extraction ───
//
// Actor: wedo_software/wedo-scrape-menu ($0.015 README → ~$0.10 real per
// PDF restaurant, validated на Pizza Na Wypasie 12.05.2026).
//
// Input shape: { urls: ["https://restaurant.com"] } — actor auto-deep-crawls
// homepage, finds linked PDFs, OCR-extracts dishes з allergen codes.
//
// Returns array of items, each: { type, url, restaurant, menu: [{group,
// dishes: [{name, allergenes, price?, description?}]}] }.

const WEDO_ACTOR_ID = 'wedo_software~wedo-scrape-menu'
const WEDO_REQUEST_TIMEOUT_MS = 180_000

interface WedoMenuDish {
  name?: string
  price?: string | number | null
  description?: string | null
  allergenes?: string | null
}
interface WedoMenuGroup {
  group?: string
  dishes?: WedoMenuDish[]
}
interface WedoItem {
  type?: string
  url?: string
  menu?: WedoMenuGroup[]
}

function parseWedoPrice(raw: string | number | null | undefined): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const cleaned = raw.replace(/[^\d,.\-]/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

async function extractDishesViaWedo(
  apifyToken: string,
  pdfOrHomepageUrl: string,
): Promise<{ dishes: WebsiteMenuDish[]; cost_usd: number; error?: string }> {
  const url = `${'https://api.apify.com/v2'}/acts/${WEDO_ACTOR_ID}/run-sync-get-dataset-items?token=${apifyToken}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [pdfOrHomepageUrl] }),
      signal: AbortSignal.timeout(WEDO_REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    return { dishes: [], cost_usd: 0, error: `wedo network: ${err instanceof Error ? err.message : err}` }
  }
  const text = await res.text()
  if (!res.ok) {
    return { dishes: [], cost_usd: 0, error: `wedo HTTP ${res.status}: ${text.slice(0, 200)}` }
  }
  let items: WedoItem[]
  try {
    items = JSON.parse(text) as WedoItem[]
  } catch {
    return { dishes: [], cost_usd: 0, error: 'wedo parse error' }
  }
  const dishes: WebsiteMenuDish[] = []
  for (const it of items) {
    if (!Array.isArray(it.menu)) continue
    for (const group of it.menu) {
      if (!Array.isArray(group.dishes)) continue
      for (const d of group.dishes) {
        if (!d.name?.trim()) continue
        dishes.push({
          name_pl: d.name.trim(),
          price_pln: parseWedoPrice(d.price ?? null),
          category: group.group ?? null,
          description: d.description ?? (d.allergenes ? `Alergeny: ${d.allergenes}` : null),
          confidence: 0.85,
        })
      }
    }
  }
  // Conservative cost estimate (real validated $0.10 per PDF run на Pizza)
  return { dishes, cost_usd: dishes.length > 0 ? 0.10 : 0 }
}

const SYSTEM_PROMPT = `Jesteś analitykiem menu restauracji w Polsce. Dostaniesz tekst ze strony menu polskiej restauracji. Wyłuskaj konkretne pozycje menu (dania, napoje) z nazwą, ceną (PLN), kategorią i opisem.

ZASADY:
- Zwracaj tylko realne pozycje menu, NIE general info ("Witamy", "Zapraszamy", "Adres").
- price_pln: cena za pozycję w złotych (number, np. 28.50). Jeśli wiele wariantów (mała/duża) — bierz mniejszą lub typową. Jeśli "od 25 zł" — bierz 25.
- category: nazwa sekcji menu (np. "Sushi", "Pizza", "Burgery", "Napoje", "Dodatki"). Jeśli brak — null.
- description: krótki opis składu jeśli widoczny w menu, max 200 znaków.
- confidence: 0.9+ jeśli nazwa + cena + kategoria jasne; 0.7 jeśli brak ceny ale nazwa konkretna; 0.4 jeśli niepewne (możliwe że to nie pozycja menu).
- Pomijaj duplikaty.
- Limit: max 200 pozycji w odpowiedzi.

OUTPUT: czysty JSON, bez preambuły, bez markdown.

Schemat:
{
  "dishes": [
    {
      "name_pl": "Pierogi ruskie",
      "price_pln": 24.0,
      "category": "Pierogi",
      "description": "Z twarogiem i ziemniakami, podawane z masłem",
      "confidence": 0.95
    }
  ]
}`

interface AiOutput {
  dishes?: WebsiteMenuDish[]
}

/**
 * Public entry. Tries paths у MENU_PATHS order на website domain. Returns
 * first successful match (HTML з dishes ≥1, OR PDF з wedo extraction).
 *
 * Sprint S6D Day 3 — added optional apifyToken для PDF wedo path. Якщо
 * undefined + PDF detected → result.source='no_match' з note. Якщо HTML
 * looks UpMenu iframe (cs.cdn-upm.com signature + sparse content) → skip
 * без AI cost, source='upmenu_blocked'.
 *
 * @param websiteUrl — base URL like 'https://domeksushi.pl' (з або без trailing slash)
 * @param anthropicApiKey — ANTHROPIC_API_KEY for HTML AI extract
 * @param apifyToken — optional, для PDF wedo path (~$0.10/restaurant)
 */
export async function extractMenuFromWebsite(
  websiteUrl: string,
  anthropicApiKey: string,
  apifyToken?: string,
): Promise<WebsiteMenuExtractResult> {
  const result: WebsiteMenuExtractResult = {
    url: websiteUrl,
    matched_path: null,
    pages_fetched: [],
    content_type: null,
    source: 'no_match',
    dishes: [],
    cost_usd: 0,
  }

  if (!anthropicApiKey) {
    result.source = 'error'
    result.error = 'ANTHROPIC_API_KEY missing'
    return result
  }

  let base: URL
  try {
    base = new URL(websiteUrl)
  } catch {
    result.source = 'error'
    result.error = `invalid URL: ${websiteUrl.slice(0, 80)}`
    return result
  }

  // Sprint S-MENU Day 2 (15.05.2026) — Restaumatic JSON-LD fast path.
  // Try BEFORE existing path loop (Vadym constraint: Restaumatic check first,
  // UpMenu check second — avoid false-positive UpMenu signature inside
  // Restaumatic-hosted sites' footer scripts).
  // - status='success' → return immediately з parsed dishes
  // - status='not_restaumatic' → fall through до existing path-walking
  // - status='partial' OR 'error' (timeout, fetch fail) → log error,
  //   fall through (Restaumatic detected але pipeline incomplete — give
  //   AI Haiku path a chance)
  try {
    const restaumatic = await extractRestaumaticMenu(base.origin)
    if (restaumatic.status === 'success' && restaumatic.dishes.length > 0) {
      result.source = 'restaumatic_jsonld'
      result.matched_path = restaumatic.source_url
        ? new URL(restaumatic.source_url).pathname
        : null
      result.content_type = 'html'
      result.pages_fetched.push(result.matched_path ?? '/')
      result.dishes = restaumatic.dishes.map((d) => ({
        name_pl: d.name,
        price_pln: d.price_pln,
        category: d.section,
        description: d.description,
        confidence: 0.95, // JSON-LD structured data — high confidence
      }))
      // No AI cost — JSON-LD parse is free (just HTTP fetch). Leave 0.
      return result
    }
    // status='not_restaumatic' OR 'partial'/'error' — preserve error context
    // for downstream debugging, then proceed з existing logic
    if (restaumatic.status !== 'not_restaumatic' && restaumatic.error) {
      console.warn('[website-menu] Restaumatic fast path failed:', restaumatic.error)
    }
  } catch (err) {
    // Defensive — extractRestaumaticMenu has its own Promise.race, але
    // якщо unexpected throw — continue до slow path замість crash
    console.warn('[website-menu] Restaumatic extractor threw:', err)
  }

  let matchedHtml: string | null = null
  let upMenuDetected = false
  for (const path of MENU_PATHS) {
    const url = new URL(path, base.origin).toString()
    const res = await fetchPage(url)
    if (!res) continue
    result.pages_fetched.push(path)

    // Sprint S6D Day 3 — PDF detected → wedo path (якщо apifyToken provided)
    if (res.contentType === 'pdf') {
      result.content_type = 'pdf'
      result.matched_path = path
      if (!apifyToken) {
        result.source = 'no_match'
        result.error = 'PDF menu detected, але apifyToken missing — cannot call wedo'
        return result
      }
      const wedo = await extractDishesViaWedo(apifyToken, res.finalUrl)
      result.cost_usd = wedo.cost_usd
      result.dishes = wedo.dishes
      result.source = wedo.dishes.length > 0 ? 'pdf_wedo' : 'no_match'
      result.error = wedo.error
      return result
    }

    if (res.contentType !== 'html' || !res.html.trim()) continue

    // Sprint S6D Day 3 — UpMenu iframe detect. Якщо signature present
    // AND content sparse → skip without AI cost.
    if (detectUpMenu(res.html)) {
      upMenuDetected = true
      result.matched_path = path
      result.content_type = 'html'
      result.source = 'upmenu_blocked'
      result.error = 'UpMenu iframe detected — server-side scrape blocked. Fallback do GMaps popular dishes.'
      return result
    }

    const text = stripHtml(res.html).slice(0, MAX_TOTAL_TEXT)
    // Heuristic: menu page has price-like patterns ("XX zł" або "XX,XX")
    // — skip pages without any prices (likely landing pages, not menu).
    const hasPrice = /\d{1,3}[,.]?\d{0,2}\s*(zł|PLN|pln)/i.test(text)
    if (!hasPrice && text.length < 1500) continue
    matchedHtml = text
    result.matched_path = path
    result.content_type = 'html'
    break
  }

  if (!matchedHtml) {
    result.source = upMenuDetected ? 'upmenu_blocked' : 'no_match'
    if (!result.error) {
      result.error = `no menu page found across ${MENU_PATHS.length} paths`
    }
    return result
  }

  const userPrompt = `URL: ${websiteUrl}${result.matched_path ?? ''}\n\nTREŚĆ STRONY:\n${matchedHtml}\n\nZADANIE: Zwróć JSON {dishes: [...]} dishes na podstawie tego tekstu menu.`

  const ai = await callAI({
    // Sprint S6D Day 3 BUGFIX (12.05.2026) — parameter renamed з `apiKey`
    // → `anthropicApiKey` коли Day 3 КРОК 2 додав `apifyToken` arg.
    // Shorthand `{ apiKey }` referenced undefined variable (TS18004).
    apiKey: anthropicApiKey,
    provider: 'anthropic',
    model: AI_MODELS.FAST,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 4000,
    temperature: 0.2,
  })

  if (ai.error || !ai.text) {
    result.source = 'error'
    result.error = `AI: ${ai.error ?? 'empty response'}`
    return result
  }

  // Approximate cost (Haiku 4.5 ~$1 in / $5 out per 1M tokens). Tokens
  // estimated from prompt size + max output.
  const tokens = ai.tokensUsed ?? 5000
  result.cost_usd =
    Math.round(((tokens * 0.5 * 1.0 + tokens * 0.5 * 5.0) / 1_000_000) * 10000) /
    10000

  try {
    const parsed = extractJSON<AiOutput>(ai.text)
    const dishes = Array.isArray(parsed.dishes) ? parsed.dishes : []
    result.dishes = dishes
      .filter((d) => d && typeof d.name_pl === 'string' && d.name_pl.trim().length > 0)
      .map((d) => ({
        name_pl: d.name_pl.trim(),
        price_pln: typeof d.price_pln === 'number' && Number.isFinite(d.price_pln) ? d.price_pln : null,
        category: typeof d.category === 'string' ? d.category : null,
        description: typeof d.description === 'string' ? d.description : null,
        confidence:
          typeof d.confidence === 'number' && d.confidence >= 0 && d.confidence <= 1
            ? d.confidence
            : 0.5,
      }))
    // Sprint S6D Day 3 — set source='static_html_ai' on success. Якщо
    // AI returned 0 dishes — залишається 'no_match' (no AI extraction success).
    if (result.dishes.length > 0) {
      result.source = 'static_html_ai'
    }
  } catch (err) {
    result.error = `AI parse: ${err instanceof Error ? err.message : err}`
  }

  return result
}
