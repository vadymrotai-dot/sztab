// lib/ai/sku-attributes.ts
// AI bulk SKU-attribute generator.
//
// Provider: Anthropic Claude Haiku 4.5 (cheap+fast, $1/$5 per 1M tokens),
// via callAI() abstraction layer. Swapped from Gemini 2026-04-28 after
// free-tier quota exhaustion. Code path provider-neutral — re-route без
// API surface change.
//
// Batching: 10 SKU per call (token economy + JSON reliability на Haiku).
// Returns: array of {sku_id, attributes: {key: value|null}, error?}.

import { callAI, AI_MODELS, type AIResult, extractJSON } from '@/lib/ai-providers'

const BATCH_SIZE = 10

export interface SkuInput {
  sku_id: string
  name: string
  ean: string | null
  brand: string | null
  family_name_pl: string
  required_attributes: string[]
}

export interface SkuAttrResult {
  sku_id: string
  attributes: Record<string, string | number | null>
  raw_response: string
  error?: string
  /** Per-batch metadata exposed dla logging/cost monitoring. */
  meta?: {
    model?: string
    tokens_used?: number
    duration_ms?: number
    batch_size?: number
  }
}

interface ParsedItem {
  sku_id?: unknown
  attributes?: unknown
}

const SYSTEM_PROMPT = `Jesteś asystentem klasyfikującym produkty spożywcze. Otrzymasz listę produktów (Polish + EAN + brand + Family). Twoje zadanie: dla każdego produktu zwróć wartości wymaganych atrybutów (z parametru required_attributes).

ZASADY:
- Bądź ostrożny. Jeśli nie jesteś pewien wartości — wpisz null. Nie zgaduj.
- Polskie produkty (kiszonki, sałatki, marynaty) — używaj typowych rzeczywistych wartości.
- weight_g / volume_ml zwracaj jako liczby (number), bez jednostek.
- alcohol_pct, fat_pct — number 0-100.
- packaging_type, type — krótki polski string (np. "słoik", "puszka", "butelka", "wieprzowina").
- ingredients — string z listą składników rozdzieloną przecinkami.
- brand — krótki string (np. "Czudowa Marka").

WYJŚCIE: czysta tablica JSON, bez preamble, bez markdown. Jeden obiekt per produkt, w identycznej kolejności jak input. Format:
[{"sku_id": "...", "attributes": {"brand": "...", "weight_g": 500, "packaging_type": "słoik"}}, ...]`

function buildUserPrompt(skus: SkuInput[]): string {
  const items = skus.map((s, i) => {
    return `${i + 1}. id="${s.sku_id}", name="${s.name}", ean=${
      s.ean ? `"${s.ean}"` : 'null'
    }, brand=${s.brand ? `"${s.brand}"` : 'null'}, Family="${s.family_name_pl}", required_attributes=[${s.required_attributes.map((a) => `"${a}"`).join(', ')}]`
  })
  return `Produkty:\n${items.join('\n')}\n\nZwróć JSON array zgodnie z formatem w instrukcji.`
}

async function generateBatch(
  apiKey: string,
  skus: SkuInput[],
): Promise<SkuAttrResult[]> {
  const startedAt = Date.now()
  const userPrompt = buildUserPrompt(skus)

  const ai: AIResult = await callAI({
    apiKey,
    provider: 'anthropic',
    model: AI_MODELS.FAST, // Haiku 4.5 — cheapest tier
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: 'json',
    maxTokens: 2048,
    temperature: 0.1,
  })

  const meta = {
    model: ai.model,
    tokens_used: ai.tokensUsed,
    duration_ms: Date.now() - startedAt,
    batch_size: skus.length,
  }

  if (ai.error || !ai.text) {
    const err = ai.error ?? 'empty AI response'
    return skus.map((s) => ({
      sku_id: s.sku_id,
      attributes: {},
      raw_response: ai.text ?? '',
      error: err,
      meta,
    }))
  }

  // Claude returns text — parse JSON. extractJSON expects an object root,
  // ale ми очікуємо array. Wrapping strategy: try parseArray first, else
  // throw fall-through. Local helper:
  let parsed: unknown
  try {
    parsed = extractJSONArray(ai.text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return skus.map((s) => ({
      sku_id: s.sku_id,
      attributes: {},
      raw_response: ai.text,
      error: `JSON parse failed: ${msg}`,
      meta,
    }))
  }

  if (!Array.isArray(parsed)) {
    return skus.map((s) => ({
      sku_id: s.sku_id,
      attributes: {},
      raw_response: ai.text,
      error: `Response not array (got ${typeof parsed})`,
      meta,
    }))
  }

  // Defensive map by sku_id (Claude може shuffle order у edge cases)
  const byId = new Map<string, Record<string, string | number | null>>()
  for (const item of parsed as ParsedItem[]) {
    if (typeof item?.sku_id !== 'string' || typeof item?.attributes !== 'object' || item.attributes === null) {
      continue
    }
    const cleaned: Record<string, string | number | null> = {}
    for (const [k, v] of Object.entries(item.attributes as Record<string, unknown>)) {
      if (v === null || typeof v === 'string' || typeof v === 'number') {
        cleaned[k] = v
      }
    }
    byId.set(item.sku_id, cleaned)
  }

  return skus.map((s) => ({
    sku_id: s.sku_id,
    attributes: byId.get(s.sku_id) ?? {},
    raw_response: ai.text,
    error: byId.has(s.sku_id) ? undefined : 'Missing in response',
    meta,
  }))
}

/** Local JSON-array extractor — extractJSON у ai-providers очікує object;
 *  ми очікуємо array. 4-strategy: direct → strip-markdown → array regex →
 *  brackets-only. */
function extractJSONArray(rawText: string): unknown {
  if (typeof rawText !== 'string' || rawText.length === 0) {
    throw new Error('empty')
  }
  const trimmed = rawText.trim()

  try {
    const direct = JSON.parse(trimmed)
    return direct
  } catch {}

  const noFences = trimmed
    .replace(/^```(?:json|JSON)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
  if (noFences !== trimmed) {
    try {
      return JSON.parse(noFences)
    } catch {}
  }

  const arrStart = noFences.indexOf('[')
  const arrEnd = noFences.lastIndexOf(']')
  if (arrStart >= 0 && arrEnd > arrStart) {
    const block = noFences.slice(arrStart, arrEnd + 1)
    try {
      return JSON.parse(block)
    } catch {}
  }

  throw new Error(`could not parse JSON array (preview ${trimmed.slice(0, 200)})`)
}

/** Public entry — process arbitrary number of SKUs in batches of 10. */
export async function generateSkuAttributesBulk(
  apiKey: string,
  skus: SkuInput[],
): Promise<SkuAttrResult[]> {
  if (!apiKey) throw new Error('AI API key not set (ANTHROPIC_API_KEY missing)')
  if (skus.length === 0) return []

  const results: SkuAttrResult[] = []
  for (let i = 0; i < skus.length; i += BATCH_SIZE) {
    const batch = skus.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    console.log(`[AI_BULK] Batch ${batchNum}, size=${batch.length}`)
    try {
      const batchResults = await generateBatch(apiKey, batch)
      results.push(...batchResults)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[AI_BULK] Batch ${batchNum} failed: ${msg}`)
      for (const s of batch) {
        results.push({
          sku_id: s.sku_id,
          attributes: {},
          raw_response: '',
          error: msg,
        })
      }
    }
  }
  return results
}
