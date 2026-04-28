// lib/ai/sku-attributes.ts
// Gemini bulk SKU-attribute generator.
//
// Use case: Phase 2.7 / Sprint E — fill missing required_attributes для
// SKU що не має OFF coverage (Polish niche brands, regional products,
// Czudowa Marka kiszonki). Fallback від OFF "not found" → Gemini.
//
// Default model: gemini-2.0-flash-exp (cheap, fast, JSON-mode native).
// Fallback: gemini-1.5-flash якщо exp недоступний (404 model).
//
// Batching: 10 SKU per call (token economy + JSON-mode reliability).
// Returns: array of {sku_id, attributes: {key: value|null}, error?}.

const GEMINI_MODELS = {
  // Available models verified via ListModels 2026-04-28.
  // Pick: 2.5-flash (cheap+fast, JSON mode); fallback 2.0-flash.
  primary: 'gemini-2.5-flash',
  fallback: 'gemini-2.0-flash',
}
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const REQUEST_TIMEOUT_MS = 60_000
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
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  error?: { message?: string; code?: number }
}

function buildPrompt(skus: SkuInput[]): string {
  const items = skus.map((s, i) => {
    return `${i + 1}. id="${s.sku_id}", name="${s.name}", ean=${
      s.ean ? `"${s.ean}"` : 'null'
    }, brand=${s.brand ? `"${s.brand}"` : 'null'}, Family="${
      s.family_name_pl
    }", required_attributes=[${s.required_attributes.map((a) => `"${a}"`).join(', ')}]`
  })

  return `Dla każdego z poniższych produktów spożywczych wygeneruj wartości dla wymaganych atrybutów. Bądź ostrożny — jeśli nie jesteś pewien wartości, wpisz null. Nie zgaduj. Polskie produkty (kiszonki, sałatki, marynaty etc.) — używaj rzeczywistych typowych wartości.

Produkty:
${items.join('\n')}

Wymagana odpowiedź — tablica JSON, jeden obiekt per produkt, w identycznej kolejności jak input. Każdy obiekt ma:
- sku_id: string (skopiowany z input)
- attributes: object z kluczami = required_attributes, wartości = string | number | null

Format:
[
  {"sku_id": "...", "attributes": {"brand": "...", "weight_g": 500, "packaging_type": "słoik"}},
  ...
]

Bez preamble. Bez markdown. Tylko czysty JSON array.`
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<GeminiResponse> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const data = (await res.json()) as GeminiResponse
  if (!res.ok) {
    throw new Error(
      `Gemini ${model} HTTP ${res.status}: ${data.error?.message ?? 'unknown'}`,
    )
  }
  return data
}

function extractJSON(text: string): unknown {
  const trimmed = text.trim()
  // Try direct parse first
  try {
    return JSON.parse(trimmed)
  } catch {}
  // Strip markdown fences
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim())
    } catch {}
  }
  // Find first array
  const arrMatch = trimmed.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0])
    } catch {}
  }
  throw new Error(`Could not extract JSON from response (${trimmed.slice(0, 200)})`)
}

async function generateBatch(
  apiKey: string,
  skus: SkuInput[],
): Promise<SkuAttrResult[]> {
  const prompt = buildPrompt(skus)

  let response: GeminiResponse
  let modelUsed = GEMINI_MODELS.primary
  try {
    response = await callGemini(apiKey, GEMINI_MODELS.primary, prompt)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[GEMINI] primary failed (${msg}), falling back to ${GEMINI_MODELS.fallback}`)
    modelUsed = GEMINI_MODELS.fallback
    response = await callGemini(apiKey, GEMINI_MODELS.fallback, prompt)
  }

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error(
      `Gemini ${modelUsed} returned no text. finishReason=${response.candidates?.[0]?.finishReason}`,
    )
  }

  const parsed = extractJSON(text)
  if (!Array.isArray(parsed)) {
    throw new Error(`Gemini response is not array (got ${typeof parsed})`)
  }

  // Map results back by sku_id (defensive — model may shuffle order)
  const byId = new Map<string, Record<string, string | number | null>>()
  for (const item of parsed) {
    if (
      typeof item === 'object' &&
      item !== null &&
      'sku_id' in item &&
      typeof (item as { sku_id: unknown }).sku_id === 'string' &&
      'attributes' in item &&
      typeof (item as { attributes: unknown }).attributes === 'object'
    ) {
      const r = item as { sku_id: string; attributes: Record<string, unknown> }
      const cleaned: Record<string, string | number | null> = {}
      for (const [k, v] of Object.entries(r.attributes)) {
        if (v === null || typeof v === 'string' || typeof v === 'number') {
          cleaned[k] = v
        }
      }
      byId.set(r.sku_id, cleaned)
    }
  }

  return skus.map((s) => ({
    sku_id: s.sku_id,
    attributes: byId.get(s.sku_id) ?? {},
    raw_response: text,
    error: byId.has(s.sku_id) ? undefined : 'Missing in response',
  }))
}

/** Public entry — process arbitrary number of SKUs in batches of 10. */
export async function generateSkuAttributesBulk(
  apiKey: string,
  skus: SkuInput[],
): Promise<SkuAttrResult[]> {
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  if (skus.length === 0) return []

  const results: SkuAttrResult[] = []
  for (let i = 0; i < skus.length; i += BATCH_SIZE) {
    const batch = skus.slice(i, i + BATCH_SIZE)
    console.log(`[GEMINI] Batch ${Math.floor(i / BATCH_SIZE) + 1}, size=${batch.length}`)
    try {
      const batchResults = await generateBatch(apiKey, batch)
      results.push(...batchResults)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[GEMINI] Batch failed: ${msg}`)
      // Mark all skus у batch as failed
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
