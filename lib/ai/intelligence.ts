// lib/ai/intelligence.ts
// AI-driven market intelligence for Sztab. Phase 1: runFastLookup —
// szybka analiza produktu → potencjalni B2B buyers w PL z użyciem
// Gemini 2.5 Flash + Google Search grounding. Re-używa callAI z
// lib/ai-providers.ts (provider abstraction + retry/backoff). Caller
// musi dostarczyć apiKey i provider z params row (settings).

import { callAI, type AIProvider } from '@/lib/ai-providers'

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
