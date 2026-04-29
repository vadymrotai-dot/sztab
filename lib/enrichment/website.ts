// lib/enrichment/website.ts
// Sprint K / Phase 2D — website "kontakt" page extractor.
//
// Strategy:
//   1. Fetch home + /kontakt + /o-nas + /zespol (best-effort)
//   2. Strip HTML to text (basic regex; cheerio installed але overkill для
//      simple text extraction)
//   3. AI extract via Claude Haiku 4.5 — structured JSON {persons, emails,
//      phones}
//
// Output: candidate persons with role/email/phone + confidence score.
// Caller decides whether to auto-create або queue для manual review.

import { callAI, AI_MODELS, extractJSON } from '@/lib/ai-providers'

const PAGE_PATHS = ['', '/kontakt', '/o-nas', '/zespol', '/zespół']
const FETCH_TIMEOUT_MS = 12_000
const MAX_HTML_PER_PAGE = 80_000 // chars; trim before AI extract
const MAX_TOTAL_TEXT = 30_000

export interface WebsitePerson {
  imie: string | null
  nazwisko: string | null
  rola: string | null
  email: string | null
  telefon: string | null
  confidence: number
}

export interface WebsiteExtractResult {
  url: string
  pages_fetched: string[]
  persons: WebsitePerson[]
  emails_global: string[]
  phones_global: string[]
  error?: string
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
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

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Sztab/1.0; +mailto:vadymrotai@gmail.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const html = await res.text()
    return html.slice(0, MAX_HTML_PER_PAGE)
  } catch {
    return null
  }
}

const SYSTEM_PROMPT = `Jesteś analitykiem sprzedaży B2B. Dostaniesz tekst ze strony WWW polskiej firmy (drobny przedsiębiorca lub mała sp. z o.o.). Wyłuskaj konkretne osoby z imieniem, nazwiskiem, rolą oraz danymi kontaktowymi. Skupiaj się na osobach decyzyjnych (właściciele, zarząd, kierownicy zaopatrzenia/sprzedaży).

ZASADY:
- Zwracaj tylko osoby, które jasno występują w tekście. Nie zgaduj.
- confidence: 0.9+ jeśli imię, nazwisko, rola jasno przypisane; 0.5-0.7 jeśli tylko imię i email; 0.3 jeśli niepewne;
- Pomijaj osoby techniczne (webmaster, "info@" jako rola).
- Jeśli email/telefon występuje globalnie (bez przypisania do osoby) — wpisz w emails_global / phones_global.

OUTPUT: czysty JSON, bez preambuły, bez markdown.
Format:
{
  "persons": [
    {"imie": "...", "nazwisko": "...", "rola": "...", "email": "...", "telefon": "...", "confidence": 0.0-1.0}
  ],
  "emails_global": ["..."],
  "phones_global": ["..."]
}`

export async function extractFromWebsite(
  baseUrl: string,
  apiKey: string,
): Promise<WebsiteExtractResult> {
  const result: WebsiteExtractResult = {
    url: baseUrl,
    pages_fetched: [],
    persons: [],
    emails_global: [],
    phones_global: [],
  }

  if (!baseUrl) {
    result.error = 'no URL'
    return result
  }
  let normalizedBase = baseUrl
  if (!/^https?:\/\//i.test(normalizedBase)) {
    normalizedBase = `https://${normalizedBase}`
  }
  let urlObj: URL
  try {
    urlObj = new URL(normalizedBase)
  } catch {
    result.error = 'invalid URL'
    return result
  }

  // Fetch pages
  const pageTexts: string[] = []
  for (const path of PAGE_PATHS) {
    const fullUrl = `${urlObj.origin}${path}`
    const html = await fetchPage(fullUrl)
    if (html) {
      result.pages_fetched.push(fullUrl)
      pageTexts.push(`=== ${fullUrl} ===\n${stripHtml(html)}`)
    }
  }
  if (pageTexts.length === 0) {
    result.error = 'no pages fetched'
    return result
  }

  const combined = pageTexts.join('\n\n').slice(0, MAX_TOTAL_TEXT)

  // AI extract
  if (!apiKey) {
    result.error = 'AI key missing'
    return result
  }
  const ai = await callAI({
    apiKey,
    provider: 'anthropic',
    model: AI_MODELS.FAST,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Strona: ${baseUrl}\n\n${combined}\n\nZwróć JSON.`,
    maxTokens: 1500,
    temperature: 0.1,
  })
  if (ai.error || !ai.text) {
    result.error = ai.error ?? 'empty AI response'
    return result
  }

  try {
    const parsed = extractJSON<{
      persons?: WebsitePerson[]
      emails_global?: string[]
      phones_global?: string[]
    }>(ai.text)
    result.persons = (parsed.persons ?? []).filter(
      (p) => p && (p.imie || p.email || p.nazwisko),
    )
    result.emails_global = parsed.emails_global ?? []
    result.phones_global = parsed.phones_global ?? []
  } catch (err) {
    result.error = `parse: ${err instanceof Error ? err.message : err}`
  }

  return result
}
