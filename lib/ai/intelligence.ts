// lib/ai/intelligence.ts
// AI-driven market intelligence for Sztab. Phase 1: runFastLookup —
// szybka analiza produktu → potencjalni B2B buyers w PL z użyciem
// Gemini 2.5 Flash + Google Search grounding. Phase 2: runDeepDiscovery
// — 4-stage pipeline (Gemini segmentation → Apify scraping → KRS
// verify → Gemini ranking) zwracający 30-50 named entities z NIP +
// outreach strategy.
//
// Re-używa callAI z lib/ai-providers.ts (provider abstraction +
// retry/backoff). Caller musi dostarczyć apiKey i provider z params
// row (settings).

import { callAI, type AIProvider } from '@/lib/ai-providers'
import { scrapePanoramaFirm, scrapeAleo } from '@/lib/integrations/apify'
import { lookupKrsByNip } from '@/lib/integrations/krs-rejestr'

export interface FastLookupInput {
  product: {
    id: string
    name: string
    category?: string | null
    gramatura?: string | null
    supplier_name: string
    cost_pln: number | null
    push_tier?: number | null
    tags?: string[] | null
  }
  context: {
    geo: 'mazowieckie' | 'poland' | 'eu'
    channels?: string[]
    exclude_chains?: string[]
  }
}

export interface FastLookupBuyerSegment {
  segment_name: string
  rationale: string
  example_companies: string[]
  estimated_count_in_geo: string
  priority: 'high' | 'medium' | 'low'
}

export interface FastLookupChannel {
  channel_name: string
  fit_score: number
  rationale: string
}

export interface FastLookupPricingStrategy {
  suggested_tier: string
  price_anchor: string
  sample_strategy: string
}

export interface FastLookupResult {
  buyer_segments: FastLookupBuyerSegment[]
  channels: FastLookupChannel[]
  pricing_strategy: FastLookupPricingStrategy
  outreach_summary: string
  warnings?: string[]
}

export interface FastLookupRunOutput {
  result: FastLookupResult
  raw_response: { text: string; tokensUsed?: number; model?: string }
  prompt_text: string
  duration_ms: number
}

const TIMEOUT_MS = 90_000

export async function runFastLookup(
  input: FastLookupInput,
  apiKey: string,
  provider: AIProvider = 'gemini',
): Promise<FastLookupRunOutput> {
  const startTime = Date.now()
  const prompt = buildFastLookupPrompt(input)

  // 90s timeout — Gemini 2.5 Flash z Google Search zwykle 20-30s,
  // ale przy peak load potrafi i 60s. Poza tym lepiej wcześniej
  // failnąć niż blokować server action w nieskończoność.
  //
  // maxTokens 16384: response z 5 buyer_segments × 4 firmy × rationale
  // + 4 channels + pricing + warnings + grounding overhead potrafi
  // wyjść poza 8K → JSON.parse fail (truncated mid-string). 16K daje
  // bezpieczny margines bez nadmiernego cost burn.
  // responseMimeType='application/json' jest niekompatybilne z
  // tools.google_search (Gemini API rzuca 400) — zamiast tego prompt
  // wymaga "WYŁĄCZNIE valid JSON".
  const aiPromise = callAI({
    apiKey,
    provider,
    userPrompt: prompt,
    useGoogleSearch: true,
    model: 'gemini-2.5-flash',
    maxTokens: 16384,
    temperature: 0.7,
  })

  const ai = await Promise.race([
    aiPromise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Analiza trwała zbyt długo (>90s)')),
        TIMEOUT_MS,
      ),
    ),
  ])

  if (ai.error || !ai.text) {
    throw new Error(ai.error || 'Pusta odpowiedź AI')
  }

  const result = extractJsonFromResponse<FastLookupResult>(ai.text)

  return {
    result,
    raw_response: {
      text: ai.text,
      tokensUsed: ai.tokensUsed,
      model: ai.model,
    },
    prompt_text: prompt,
    duration_ms: Date.now() - startTime,
  }
}

export function buildFastLookupPrompt(input: FastLookupInput): string {
  const p = input.product
  const c = input.context
  const geoLabel =
    c.geo === 'mazowieckie'
      ? 'województwo mazowieckie + sąsiednie (łódzkie, lubelskie, podlaskie, kujawsko-pomorskie, warmińsko-mazurskie)'
      : c.geo === 'poland'
        ? 'cała Polska'
        : 'Unia Europejska'
  const excludeList = (
    c.exclude_chains?.length
      ? c.exclude_chains
      : ['Biedronka', 'Lidl', 'Auchan', 'Carrefour', 'Tesco', 'Kaufland']
  ).join(', ')

  return `
Jesteś analitykiem rynku B2B żywności w Polsce. Vadym (trader, Ziomek Fish, Mazowieckie) sprzedaje produkt:

PRODUKT:
- Nazwa: ${p.name}
- Kategoria: ${p.category || 'n/a'}
- Gramatura: ${p.gramatura || 'n/a'}
- Dostawca/marka: ${p.supplier_name}
- Koszt zakupu: ${p.cost_pln != null ? `${p.cost_pln} PLN` : 'n/a'}
- Push tier: ${p.push_tier ?? 'n/a'}
- Tagi: ${p.tags?.length ? p.tags.join(', ') : 'n/a'}

KONTEKST RYNKOWY:
- Geo: ${geoLabel}
- Kanały Pikniko (główny partner Vadyma): HoReCa, catering, małe sklepy, przetwórstwo (jako surowiec), retail (negocjowany Leviathan)
- WYKLUCZ: sieci ogólnopolskie typu ${excludeList} — Vadym nie ma do nich kanału. Skupiaj się na regionalnych dystrybutorach (<500 osób), specjalistycznych sklepach, lokalnych sieciach HoReCa.

ZADANIE — przeprowadź szybką analizę. Zwróć WYŁĄCZNIE valid JSON. Bez wstępu, bez wyjaśnień, bez markdown code block (\`\`\`). Pierwszy znak musi być { ostatni }.

LIMITY (twarde — nie przekraczaj):
- buyer_segments: MAX 5 elementów (sortuj po priority desc)
- channels: MAX 4 elementy
- segment_name: MAX 8 słów
- rationale (segment lub channel): MAX 2 zdania
- example_companies: MAX 4 firmy per segment
- outreach_summary: MAX 3 zdania
- warnings: MAX 4 elementy, każdy max 1 zdanie

Schema:

{
  "buyer_segments": [
    {
      "segment_name": "string (max 8 słów)",
      "rationale": "string (max 2 zdania)",
      "example_companies": ["max 4 KONKRETNYCH nazw firm. Jeśli nie znasz — 'n/a'. Wymyślania zabronione."],
      "estimated_count_in_geo": "string (np. '50-200 firm w Mazowieckim')",
      "priority": "high | medium | low"
    }
  ],
  "channels": [
    {
      "channel_name": "string",
      "fit_score": 0-100,
      "rationale": "string (max 2 zdania)"
    }
  ],
  "pricing_strategy": {
    "suggested_tier": "string",
    "price_anchor": "string — porównanie z konkurentami",
    "sample_strategy": "string — konkretna taktyka wejścia"
  },
  "outreach_summary": "string (max 3 zdania)",
  "warnings": ["max 4 ostrzeżenia o konkurencji/sezonie/regulacjach"]
}

Użyj Google Search aby zweryfikować nazwy firm i obecny stan rynku. Zwracaj tylko firmy które realnie istnieją.

Bądź konkretny i actionable. ZWRÓĆ TYLKO JSON.
`.trim()
}

export function extractJsonFromResponse<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned) as T
  } catch (firstErr) {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as T
      } catch {
        // fall through to truncation diagnostic
      }
    }
    // Diagnostic: log full length + last 500 chars before throw — most
    // common cause is response truncated mid-string at maxOutputTokens
    // boundary. Tail tells us if it ends with "...","unfinished, no
    // closing brace.
    const length = cleaned.length
    const tail = cleaned.slice(-500)
    const head = cleaned.slice(0, 200)
    const originalMessage =
      firstErr instanceof Error ? firstErr.message : String(firstErr)
    console.error(
      '[intelligence] JSON parse failed.',
      'length=', length,
      'firstError=', originalMessage,
      'head=', head,
      'tail=', tail,
    )
    const looksTruncated = !cleaned.trim().endsWith('}')
    const reason = looksTruncated
      ? 'response truncated (likely maxOutputTokens reached)'
      : 'invalid JSON structure'
    throw new Error(
      `Failed to parse Gemini JSON: ${reason}. Length: ${length}. Tail: ${tail.slice(-150)}`,
    )
  }
}

// ════════════════════════════════════════════════════════════════
// PHASE 2 — Deep Discovery
// ════════════════════════════════════════════════════════════════
// 4-stage pipeline:
//   1. Gemini segmentation → keywords + cities per segment
//   2. Apify Panorama Firm × (segment × city × keyword) — scraping
//   3. KRS Rejestr.io NIP verification — top N entities
//   4. Gemini ranking — fit_score + outreach per entity (top M)
//
// Caller (server action) jest odpowiedzialny za persist do
// discovered_entities table. Pipeline pure compute, zwraca DeepDiscovery
// Result. Vercel function timeout 5 min — limity per stage trzymają
// pipeline ≤4 min z buforem.

export interface DeepDiscoveryInput {
  product: FastLookupInput['product']
  context: FastLookupInput['context']
  apifyToken: string
  krsToken: string
  geminiKey: string
  geminiProvider?: AIProvider
}

export interface DiscoverySegment {
  segment_name: string
  rationale: string
  keywords: string[]
  cities: string[]
  priority: 'high' | 'medium' | 'low'
}

export interface DiscoveredEntity {
  name: string
  nip?: string | null
  krs?: string | null
  regon?: string | null
  website?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  branza?: string | null
  segment_name: string
  channel_type?: string | null
  source: 'aleo' | 'panorama_firm' | 'gemini_search' | 'krs_rejestr'
  source_confidence: number
  fit_score: number
  nip_verified: boolean
  krs_verified: boolean
  outreach_approach?: string | null
  outreach_pitch?: string | null
  raw_data?: unknown
}

export interface DeepDiscoveryResult {
  segments: DiscoverySegment[]
  entities: DiscoveredEntity[]
  total_found: number
  total_verified: number
  duration_ms: number
  warnings: string[]
}

// Twarde limity: pipeline musi zmieścić się w Vercel 5-min budget.
// Większe wartości → ryzyko timeout + utraty wyników.
const MAX_SEGMENTS = 5
const MAX_CITIES_PER_SEGMENT = 2
const MAX_KEYWORDS_PER_SEGMENT = 1
const MAX_ITEMS_PER_SCRAPE = 25
const MAX_PARALLEL_SCRAPES = 3
const MAX_KRS_VERIFY = 60
const MAX_PARALLEL_KRS = 5
const MAX_RANKED_ENTITIES = 50

// ────────────────────────────────────────────────────────────
// Stage 1: Gemini segmentation z keywords + cities
// ────────────────────────────────────────────────────────────

interface Stage1Response {
  segments: DiscoverySegment[]
}

function buildStage1Prompt(input: DeepDiscoveryInput): string {
  const p = input.product
  const c = input.context
  const geoLabel =
    c.geo === 'mazowieckie'
      ? 'województwo mazowieckie + sąsiednie (łódzkie, lubelskie, podlaskie, kujawsko-pomorskie, warmińsko-mazurskie)'
      : c.geo === 'poland'
        ? 'cała Polska'
        : 'Unia Europejska'
  const exclude = (
    c.exclude_chains?.length
      ? c.exclude_chains
      : ['Biedronka', 'Lidl', 'Auchan', 'Carrefour', 'Tesco', 'Kaufland']
  ).join(', ')

  return `
Jesteś analitykiem rynku B2B żywności w Polsce. Vadym (trader, Ziomek Fish, Mazowieckie) sprzedaje produkt:

- Nazwa: ${p.name}
- Kategoria: ${p.category || 'n/a'}
- Gramatura: ${p.gramatura || 'n/a'}
- Dostawca/marka: ${p.supplier_name}
- Koszt: ${p.cost_pln != null ? `${p.cost_pln} PLN` : 'n/a'}
- Tagi: ${p.tags?.length ? p.tags.join(', ') : 'n/a'}

Geo: ${geoLabel}
WYKLUCZ sieci ogólnopolskie: ${exclude}.

ZADANIE: zaproponuj ${MAX_SEGMENTS} segmentów potencjalnych B2B kupców. Dla każdego daj:
- segment_name (max 8 słów)
- rationale (max 2 zdania)
- keywords (DOKŁADNIE ${MAX_KEYWORDS_PER_SEGMENT} polskich fraz wyszukiwania, np. "sklep ekologiczny", "restauracja ukraińska", "dystrybutor kiszonek")
- cities (DOKŁADNIE ${MAX_CITIES_PER_SEGMENT} polskich miast w geo: Warszawa, Łódź, Lublin, Białystok, itd. — gdzie segment jest najgęstszy)
- priority (high/medium/low)

Zwróć WYŁĄCZNIE valid JSON, pierwszy znak {, ostatni }. Bez markdown, bez wstępu.

Schema:
{
  "segments": [
    {
      "segment_name": "string",
      "rationale": "string",
      "keywords": ["string"],
      "cities": ["string"],
      "priority": "high | medium | low"
    }
  ]
}

Sortuj segments po priority DESC.
`.trim()
}

async function runStage1Segmentation(
  input: DeepDiscoveryInput,
): Promise<DiscoverySegment[]> {
  const ai = await callAI({
    apiKey: input.geminiKey,
    provider: input.geminiProvider ?? 'gemini',
    userPrompt: buildStage1Prompt(input),
    useGoogleSearch: false, // Stage 1 to czysto strategiczne, bez search
    model: 'gemini-2.5-flash',
    maxTokens: 4096,
    temperature: 0.7,
    responseFormat: 'json',
  })

  if (ai.error || !ai.text) {
    throw new Error(ai.error || 'Stage 1 (segmentation) zwrócił pusto')
  }

  const parsed = extractJsonFromResponse<Stage1Response>(ai.text)
  const segments = (parsed.segments ?? []).slice(0, MAX_SEGMENTS)
  // Wymuszamy limity po stronie klienta — model nie zawsze ich
  // pilnuje pomimo prompt'u.
  return segments.map((s) => ({
    segment_name: s.segment_name,
    rationale: s.rationale,
    keywords: (s.keywords ?? []).slice(0, MAX_KEYWORDS_PER_SEGMENT),
    cities: (s.cities ?? []).slice(0, MAX_CITIES_PER_SEGMENT),
    priority: s.priority ?? 'medium',
  }))
}

// ────────────────────────────────────────────────────────────
// Stage 2: parallel Apify scraping
// ────────────────────────────────────────────────────────────

interface ScrapeJob {
  segment: DiscoverySegment
  city: string
  keyword: string
}

async function runStage2Scraping(
  input: DeepDiscoveryInput,
  segments: DiscoverySegment[],
  warnings: string[],
): Promise<DiscoveredEntity[]> {
  const jobs: ScrapeJob[] = []
  for (const segment of segments) {
    for (const city of segment.cities) {
      for (const keyword of segment.keywords) {
        jobs.push({ segment, city, keyword })
      }
    }
  }

  // Concurrency-limited Promise.all. Apify per-account concurrency
  // limit zazwyczaj 8-32 — 3 to bezpiecznie.
  const results: DiscoveredEntity[] = []
  for (let i = 0; i < jobs.length; i += MAX_PARALLEL_SCRAPES) {
    const chunk = jobs.slice(i, i + MAX_PARALLEL_SCRAPES)
    const chunkResults = await Promise.all(
      chunk.map(async (job) => {
        const out = await scrapePanoramaFirm(input.apifyToken, {
          keyword: job.keyword,
          city: job.city,
          limit: MAX_ITEMS_PER_SCRAPE,
          extractDetails: true,
        })
        if (out.status !== 'SUCCEEDED') {
          warnings.push(
            `Panorama Firm fail "${job.keyword}" w ${job.city}: ${out.error ?? out.status}`,
          )
          return [] as DiscoveredEntity[]
        }
        return out.items.map<DiscoveredEntity>((item) => ({
          name: item.name,
          nip: item.nip ?? null,
          regon: item.regon ?? null,
          website: item.website ?? null,
          email: item.email ?? null,
          phone: item.phone ?? null,
          address: item.address ?? item.street ?? null,
          city: item.city ?? job.city,
          region: item.voivodeship ?? null,
          postal_code: item.postalCode ?? null,
          branza: item.category ?? item.subcategory ?? null,
          segment_name: job.segment.segment_name,
          source: 'panorama_firm',
          source_confidence: 0.7,
          fit_score: 50, // placeholder, Stage 4 ranks
          nip_verified: false,
          krs_verified: false,
          raw_data: item,
        }))
      }),
    )
    for (const batch of chunkResults) results.push(...batch)
  }
  return results
}

// ────────────────────────────────────────────────────────────
// Dedup: po NIP first, potem po normalized name+city
// ────────────────────────────────────────────────────────────

const normalize = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/sp\.\s*z\s*o\.?\s*o\.?/g, '')
    .replace(/[^a-z0-9ąćęłńóśźż\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

function dedupeEntities(entities: DiscoveredEntity[]): DiscoveredEntity[] {
  const byNip = new Map<string, DiscoveredEntity>()
  const byKey = new Map<string, DiscoveredEntity>()

  for (const e of entities) {
    const cleanNip = e.nip?.replace(/\D/g, '') ?? ''
    if (cleanNip.length === 10) {
      const existing = byNip.get(cleanNip)
      byNip.set(cleanNip, existing ? mergeEntities(existing, e) : e)
      continue
    }
    const key = `${normalize(e.name)}|${normalize(e.city)}`
    if (!key.startsWith('|')) {
      const existing = byKey.get(key)
      byKey.set(key, existing ? mergeEntities(existing, e) : e)
    }
  }

  return [...byNip.values(), ...byKey.values()]
}

function mergeEntities(
  a: DiscoveredEntity,
  b: DiscoveredEntity,
): DiscoveredEntity {
  // Zachowuje pierwszy non-null per pole. Source = pierwszego.
  return {
    ...a,
    nip: a.nip ?? b.nip ?? null,
    krs: a.krs ?? b.krs ?? null,
    regon: a.regon ?? b.regon ?? null,
    website: a.website ?? b.website ?? null,
    email: a.email ?? b.email ?? null,
    phone: a.phone ?? b.phone ?? null,
    address: a.address ?? b.address ?? null,
    city: a.city ?? b.city ?? null,
    region: a.region ?? b.region ?? null,
    postal_code: a.postal_code ?? b.postal_code ?? null,
    branza: a.branza ?? b.branza ?? null,
    source_confidence: Math.max(a.source_confidence, b.source_confidence),
  }
}

// ────────────────────────────────────────────────────────────
// Stage 3: KRS verification (top N entities z NIP)
// ────────────────────────────────────────────────────────────

async function runStage3Verification(
  input: DeepDiscoveryInput,
  entities: DiscoveredEntity[],
  warnings: string[],
): Promise<DiscoveredEntity[]> {
  const toVerify = entities.slice(0, MAX_KRS_VERIFY).filter((e) => e.nip)
  // Concurrency limited do MAX_PARALLEL_KRS — KRS Rejestr ma rate limit.
  for (let i = 0; i < toVerify.length; i += MAX_PARALLEL_KRS) {
    const chunk = toVerify.slice(i, i + MAX_PARALLEL_KRS)
    await Promise.all(
      chunk.map(async (entity) => {
        if (!entity.nip) return
        try {
          const krs = await lookupKrsByNip(input.krsToken, entity.nip)
          if (krs) {
            entity.nip_verified = true
            entity.krs = entity.krs ?? krs.krs ?? null
            entity.krs_verified = !!krs.krs
            entity.regon = entity.regon ?? krs.regon ?? null
            if (krs.address) {
              entity.city = entity.city ?? krs.address.city ?? null
              entity.region = entity.region ?? krs.address.region ?? null
              entity.postal_code =
                entity.postal_code ?? krs.address.postalCode ?? null
            }
            entity.source_confidence = 0.95
          }
        } catch (err) {
          warnings.push(
            `KRS lookup failed ${entity.name} (${entity.nip}): ${err instanceof Error ? err.message : 'unknown'}`,
          )
        }
      }),
    )
  }
  return entities
}

// ────────────────────────────────────────────────────────────
// Stage 4: Gemini ranking + outreach
// ────────────────────────────────────────────────────────────

interface Stage4RankItem {
  name: string
  nip?: string | null
  fit_score: number
  outreach_approach: string
  outreach_pitch: string
}

interface Stage4Response {
  ranked: Stage4RankItem[]
}

function buildStage4Prompt(
  input: DeepDiscoveryInput,
  entities: DiscoveredEntity[],
): string {
  const p = input.product
  const list = entities
    .map((e, i) => {
      return `${i + 1}. ${e.name}${e.nip ? ` (NIP ${e.nip})` : ''}${e.city ? `, ${e.city}` : ''}${e.branza ? ` — ${e.branza}` : ''}`
    })
    .join('\n')

  return `
Jesteś analitykiem B2B. Mamy listę ${entities.length} firm znalezionych przez scraper. Vadym sprzedaje:

- Produkt: ${p.name} (${p.category || 'n/a'}, ${p.gramatura || 'n/a'})
- Marka: ${p.supplier_name}, koszt ${p.cost_pln ?? 'n/a'} PLN

LISTA FIRM:
${list}

ZADANIE: dla KAŻDEJ firmy zwróć fit_score 0-100 (jak dobrze pasuje jako B2B kupiec tego produktu) + outreach_approach (max 1 zdanie, np. "Cold email do działu zakupów") + outreach_pitch (max 2 zdania, konkretny pitch dla tej firmy).

Zwróć WYŁĄCZNIE valid JSON. Schema:
{
  "ranked": [
    {
      "name": "string (musi pasować do listy powyżej, identyczna nazwa)",
      "nip": "string lub null",
      "fit_score": 0-100,
      "outreach_approach": "string",
      "outreach_pitch": "string"
    }
  ]
}

Bez wstępu, bez markdown. Pierwszy znak {, ostatni }.
`.trim()
}

async function runStage4Ranking(
  input: DeepDiscoveryInput,
  entities: DiscoveredEntity[],
  warnings: string[],
): Promise<DiscoveredEntity[]> {
  if (entities.length === 0) return entities
  const toRank = entities.slice(0, MAX_RANKED_ENTITIES)
  try {
    const ai = await callAI({
      apiKey: input.geminiKey,
      provider: input.geminiProvider ?? 'gemini',
      userPrompt: buildStage4Prompt(input, toRank),
      useGoogleSearch: false,
      model: 'gemini-2.5-flash',
      maxTokens: 16384,
      temperature: 0.5,
      responseFormat: 'json',
    })

    if (ai.error || !ai.text) {
      warnings.push(
        `Stage 4 (ranking) failed: ${ai.error ?? 'empty response'} — entities zachowane bez fit_score / outreach.`,
      )
      return entities
    }

    const parsed = extractJsonFromResponse<Stage4Response>(ai.text)
    const ranks = parsed.ranked ?? []
    // Match po name (lowercase trimmed) — model czasem nieznacznie
    // przekształca diacritics. Dlatego normalize.
    const byName = new Map<string, Stage4RankItem>()
    for (const r of ranks) byName.set(normalize(r.name), r)

    return entities.map((e) => {
      const r = byName.get(normalize(e.name))
      if (!r) return e
      return {
        ...e,
        fit_score: Math.max(
          0,
          Math.min(100, Math.round(r.fit_score)),
        ),
        outreach_approach: r.outreach_approach,
        outreach_pitch: r.outreach_pitch,
      }
    })
  } catch (err) {
    warnings.push(
      `Stage 4 (ranking) exception: ${err instanceof Error ? err.message : 'unknown'} — entities zachowane bez ranking.`,
    )
    return entities
  }
}

// ────────────────────────────────────────────────────────────
// Pipeline orchestrator
// ────────────────────────────────────────────────────────────

export async function runDeepDiscovery(
  input: DeepDiscoveryInput,
): Promise<DeepDiscoveryResult> {
  const startTime = Date.now()
  const warnings: string[] = []

  const segments = await runStage1Segmentation(input)
  if (segments.length === 0) {
    return {
      segments: [],
      entities: [],
      total_found: 0,
      total_verified: 0,
      duration_ms: Date.now() - startTime,
      warnings: ['Stage 1 zwrócił 0 segmentów — model nie znalazł kontekstu.'],
    }
  }

  const rawEntities = await runStage2Scraping(input, segments, warnings)
  const total_found = rawEntities.length
  const deduped = dedupeEntities(rawEntities)
  const verified = await runStage3Verification(input, deduped, warnings)
  // Sortuj po nip_verified DESC przed Stage 4 — pierwszeństwo dla
  // verified entities, model dostanie konkretne firmy do rankingu.
  verified.sort((a, b) => Number(b.nip_verified) - Number(a.nip_verified))
  const ranked = await runStage4Ranking(input, verified, warnings)
  // Final sort: fit_score DESC.
  ranked.sort((a, b) => b.fit_score - a.fit_score)

  return {
    segments,
    entities: ranked,
    total_found,
    total_verified: ranked.filter((e) => e.nip_verified).length,
    duration_ms: Date.now() - startTime,
    warnings,
  }
}

export const deepDiscoveryLimits = {
  MAX_SEGMENTS,
  MAX_CITIES_PER_SEGMENT,
  MAX_KEYWORDS_PER_SEGMENT,
  MAX_ITEMS_PER_SCRAPE,
  MAX_KRS_VERIFY,
  MAX_RANKED_ENTITIES,
}

// ⚠ Aleo scraper (scrapeAleo) zaimportowany ale nie wpięty — Phase 2
// MVP używa tylko Panorama Firm. W kolejnym sprincie można dorzucić
// jako drugie źródło w Stage 2 + dedupe oba.
void scrapeAleo
