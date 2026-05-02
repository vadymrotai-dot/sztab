// lib/ai/cn-code-suggester.ts
// Sprint S-INTEL.1.1 — AI helper що пропонує 8-цифровий CN code (Combined
// Nomenclature, EU TARIC) на основі назви + категорії + інших product fields.
//
// Pattern: Option B (AI inference, Haiku 4.5) per audit-s-intel-1-1.md Section 4.
// Cost ~$0.0008/call (full system + user prompt + ~80 output tokens).
//
// Used by:
//  - app/api/products/cn-suggest/route.ts (UI button "Zaproponuj AI")
//  - scripts/backfill-cn-codes.ts (defer до S-INTEL.1.1.5)

import { callAI, AI_MODELS, extractJSON } from '@/lib/ai-providers'

export interface ProductInfo {
  name: string
  category?: string | null
  gramatura?: string | null
  ean?: string | null
  vertical?: string | null
  brand?: string | null
}

export interface CnSuggestion {
  cn_code: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  alternatives?: string[]
  model_used: string
  suggested_at: string
}

export class CnCodeSuggesterError extends Error {
  constructor(
    message: string,
    public readonly kind: 'ai_failure' | 'invalid_format' | 'missing_key',
    public readonly raw?: string,
  ) {
    super(message)
    this.name = 'CnCodeSuggesterError'
  }
}

const SYSTEM_PROMPT = `Jesteś ekspertem polskiej klasyfikacji celnej Combined Nomenclature (CN, EU 8-digit).
Twoje zadanie: na podstawie nazwy i kategorii produktu zaproponować jeden 8-cyfrowy kod CN
zgodny z aktualną nomenklaturą TARIC. Specjalizujesz się w produktach żywnościowych dla rynku
polskiego i HoReCa (kiszonki, marynaty, sałatki gotowe, miód, wędliny, słodycze).
Zwracaj WYŁĄCZNIE JSON zgodnie ze schemą — bez prozy, bez markdown, bez \`\`\`.`

function buildUserPrompt(input: ProductInfo): string {
  return `Produkt:
- Nazwa: ${input.name}
- Kategoria: ${input.category ?? 'brak'}
- Gramatura: ${input.gramatura ?? 'brak'}
- EAN: ${input.ean ?? 'brak'}
- Wertykał: ${input.vertical ?? 'brak'}
- Brand: ${input.brand ?? 'brak'}

Zwróć JSON: { "cn_code": "01234567", "confidence": "high|medium|low", "reasoning": "...", "alternatives": ["...", "..."] (opcjonalnie do 2) }

Rozdziały CN istotne dla typowych produktów Sztab:
- 0710-0712: warzywa mrożone/suszone
- 2001-2005: warzywa konserwowane octem/kiszone/marynowane
- 2007-2008: dżemy / przetwory owocowe / sałatki owocowe
- 0409: miód naturalny
- 1601-1602: wędliny
- 1704: cukierki/słodycze niezawierające kakao
- 1806: wyroby z czekolady
- 2009: soki

Wybierz 8-cyfrowy kod precyzyjnie odpowiadający, nie poziom 4- czy 6-cyfrowy.

Confidence:
- "high" — produkt jednoznacznie pasuje do konkretnego 8-digit code (np. miód naturalny → 04090000)
- "medium" — kategoria pasuje, ale 8-digit poziom wymaga założeń (np. konkretna marynata wśród 2001xx — wybór między octem a innym medium)
- "low" — produkt nietypowy lub multi-component, alternatywy realne. Wówczas zawsze podaj 1-2 alternatives.

Reasoning: 1-2 zdania po polsku — czemu właśnie ten kod, na czym oparte założenie.`
}

/**
 * Strip whitespace, validate against ^[0-9]{8}$ regex.
 * Throw CnCodeSuggesterError якщо невалідний.
 */
function normalizeCnCode(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new CnCodeSuggesterError(
      `AI повернуло cn_code не як string (typeof=${typeof raw})`,
      'invalid_format',
      String(raw),
    )
  }
  const stripped = raw.replace(/\s+/g, '')
  if (!/^[0-9]{8}$/.test(stripped)) {
    throw new CnCodeSuggesterError(
      `AI повернуло невалідний CN code: "${raw}" (після strip spaces: "${stripped}"). Очікуємо 8 цифр.`,
      'invalid_format',
      raw,
    )
  }
  return stripped
}

function normalizeAlternatives(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const valid: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const stripped = item.replace(/\s+/g, '')
    if (/^[0-9]{8}$/.test(stripped)) valid.push(stripped)
  }
  return valid.length > 0 ? valid.slice(0, 2) : undefined
}

/**
 * Suggest 8-digit CN code для product через Claude Haiku 4.5.
 *
 * Throws CnCodeSuggesterError на:
 *  - Missing API key (kind='missing_key')
 *  - AI failure / empty response / parse error (kind='ai_failure')
 *  - AI повернуло невалідний format (kind='invalid_format')
 */
export async function suggestCnCode(
  apiKey: string,
  input: ProductInfo,
): Promise<CnSuggestion> {
  if (!apiKey) {
    throw new CnCodeSuggesterError(
      'ANTHROPIC_API_KEY missing — set у settings → Klucze API.',
      'missing_key',
    )
  }
  if (!input.name || !input.name.trim()) {
    throw new CnCodeSuggesterError(
      'Nazwa produktu wymagana для AI suggest.',
      'invalid_format',
    )
  }

  const ai = await callAI({
    apiKey,
    provider: 'anthropic',
    model: AI_MODELS.FAST,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(input),
    maxTokens: 400,
    temperature: 0.2,
  })

  if (ai.error || !ai.text) {
    throw new CnCodeSuggesterError(
      `AI failure: ${ai.error ?? 'empty response'}`,
      'ai_failure',
    )
  }

  let parsed: {
    cn_code?: unknown
    confidence?: unknown
    reasoning?: unknown
    alternatives?: unknown
  }
  try {
    parsed = extractJSON(ai.text)
  } catch (err) {
    throw new CnCodeSuggesterError(
      `parse failed: ${err instanceof Error ? err.message : String(err)}`,
      'ai_failure',
      ai.text,
    )
  }

  const cnCode = normalizeCnCode(parsed.cn_code)
  const rawConfidence =
    typeof parsed.confidence === 'string' ? parsed.confidence.toLowerCase() : 'low'
  const confidence: CnSuggestion['confidence'] =
    rawConfidence === 'high' || rawConfidence === 'medium' ? rawConfidence : 'low'
  const reasoning =
    typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
      ? parsed.reasoning.trim()
      : '(AI не подав reasoning)'

  return {
    cn_code: cnCode,
    confidence,
    reasoning,
    alternatives: normalizeAlternatives(parsed.alternatives),
    model_used: 'claude-haiku-4-5-20251001',
    suggested_at: new Date().toISOString(),
  }
}
