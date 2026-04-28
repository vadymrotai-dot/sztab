// lib/ai-providers.ts
// Universal AI provider interface with Gemini support.
// Supports: text gen, structured JSON, Google Search grounding, grounding sources.
//
// Retry policy (callGemini):
//   - 5 total attempts (1 initial + 4 retries) on 429 / 503 / 504
//   - Exponential backoff 1s / 2s / 4s / 8s pomiędzy próbami
//   - Po wyczerpaniu retries: throw GeminiUnavailableError (caught przez
//     callAI outer try/catch → returns AIResult{ error: friendly_pl_msg }
//     → existing API contract preserved, callers nie muszą się zmieniać)
//   - Non-retryable statuses (400/401/403/422 itd.) — bail out
//     natychmiast z raw error (current behavior)
//   - Logi prefiksowane [GEMINI] dla observability

// ─────────────────────────────────────────────────────────────────
// JSON extraction utility — robust parsing dla Gemini responses
// gdy native JSON mode nie jest dostępny (np. useGoogleSearch=true,
// gdzie responseMimeType jest niekompatybilny z google_search tool).
//
// Common Gemini failure modes:
//   1. Markdown code fences (```json ... ```) wokół payloadu
//   2. Prefix/suffix proza wokół { ... } block
//   3. Raw newlines / control chars (0x00-0x1F) wewnątrz string values
//      → JSON spec wymaga escape (\n, \r, \t lub \uXXXX). Gemini czasem
//      emituje raw \n w polskich tekstach (potential_summary, description).
//
// extractJSON próbuje 4 strategii w kolejności fallback. Po wyczerpaniu
// wszystkich rzuca AIParseError zawierający raw text + ostatnio próbowany
// cleaned variant — caller loguje pod prefiksem [AI_PARSE_ERROR] i zwraca
// friendly polski komunikat użytkownikowi.

export class AIParseError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
    public readonly cleaned?: string,
  ) {
    super(message)
    this.name = 'AIParseError'
  }
}

/**
 * Gemini zwrócił plain-text zamiast JSON (np. "An error occurred during
 * processing...", "I cannot...", "I apologize..."). Inny failure mode niż
 * AIParseError (malformed JSON) — to Gemini-side refusal/hallucination,
 * nie nasz parse bug. Caller pokazuje inną friendly message.
 */
export class AIInvalidResponseError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
  ) {
    super(message)
    this.name = 'AIInvalidResponseError'
  }
}

/**
 * Sanitize raw control chars within JSON string values. Naïve scanner
 * (tracks in-string + escape state) — unescaped 0x00-0x1F inside a
 * string literal is replaced with \n / \r / \t / \uXXXX.
 *
 * Doesn't handle nested structures perfectly but for typical Gemini
 * structured output (flat key-value pairs with multiline string values)
 * is sufficient.
 */
function sanitizeJsonStrings(text: string): string {
  let out = ''
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const code = text.charCodeAt(i)
    if (escape) {
      out += ch
      escape = false
      continue
    }
    if (ch === '\\') {
      out += ch
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      out += ch
      continue
    }
    if (inString && code < 0x20) {
      if (ch === '\n') out += '\\n'
      else if (ch === '\r') out += '\\r'
      else if (ch === '\t') out += '\\t'
      else out += '\\u' + code.toString(16).padStart(4, '0')
      continue
    }
    out += ch
  }
  return out
}

export function extractJSON<T = unknown>(rawText: string): T {
  if (typeof rawText !== 'string' || rawText.length === 0) {
    throw new AIParseError('Empty AI response', rawText ?? '')
  }

  const trimmed = rawText.trim()

  // Pre-check: response without any '{' to oznacza że Gemini zwrócił
  // plain text (typowo: "An error occurred during processing...",
  // "I cannot...", "I apologize..."). Inny failure mode niż malformed
  // JSON — odmowa modelu / API-side error sneaking jako 200 OK z text.
  // Nie próbujemy strategii — natychmiast throw AIInvalidResponseError
  // żeby caller pokazał inny friendly message.
  if (!trimmed.includes('{')) {
    throw new AIInvalidResponseError(
      `Gemini returned plain text instead of JSON (no '{' detected)`,
      rawText,
    )
  }

  const attempts: string[] = []

  // Strategy 1: direct parse na trimmed text
  attempts.push(trimmed)
  try {
    return JSON.parse(trimmed) as T
  } catch {
    // continue
  }

  // Strategy 2: strip markdown code fences ```json ... ```
  const noFences = trimmed
    .replace(/^```(?:json|JSON)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
  if (noFences !== trimmed) {
    attempts.push(noFences)
    try {
      return JSON.parse(noFences) as T
    } catch {
      // continue
    }
  }

  // Strategy 3: extract first { ... last } block (greedy, w razie prozy
  // przed/po payloadzie)
  let block = noFences
  const objStart = noFences.indexOf('{')
  const objEnd = noFences.lastIndexOf('}')
  if (objStart >= 0 && objEnd > objStart) {
    block = noFences.slice(objStart, objEnd + 1)
    if (block !== noFences) {
      attempts.push(block)
      try {
        return JSON.parse(block) as T
      } catch {
        // continue
      }
    }
  }

  // Strategy 4: sanitize raw control chars within strings (typical
  // Gemini issue z raw \n w polskich opisach)
  const sanitized = sanitizeJsonStrings(block)
  if (sanitized !== block) {
    attempts.push(sanitized)
    try {
      return JSON.parse(sanitized) as T
    } catch {
      // continue
    }
  }

  throw new AIParseError(
    `JSON parse exhausted ${attempts.length} strategies (markdown strip, block extract, control-char sanitize)`,
    rawText,
    sanitized,
  )
}

export class GeminiUnavailableError extends Error {
  constructor(
    message?: string,
    public readonly lastStatus?: number,
    public readonly attempts?: number,
  ) {
    super(
      message ??
        'Gemini API tymczasowo niedostępne. Spróbuj ponownie za kilka minut.',
    )
    this.name = 'GeminiUnavailableError'
  }
}

const GEMINI_RETRYABLE_STATUSES = new Set<number>([429, 503, 504])
const GEMINI_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000] as const
const GEMINI_MAX_ATTEMPTS = GEMINI_RETRY_DELAYS_MS.length + 1

export type AIProvider = "gemini" | "anthropic" | "openrouter"

export interface AIParams {
  apiKey: string
  provider: AIProvider
  systemPrompt?: string
  userPrompt: string
  responseFormat?: "text" | "json"
  maxTokens?: number
  temperature?: number
  /** Use Gemini Pro with Google Search tool enabled */
  useGoogleSearch?: boolean
  /** Preferred model id. If not provided, a sensible default is used. */
  model?: string
}

export interface GroundingSource {
  title?: string
  uri?: string
}

export interface AIResult {
  text: string
  tokensUsed?: number
  model?: string
  groundingSources?: GroundingSource[]
  error?: string
}

export async function callAI(params: AIParams): Promise<AIResult> {
  try {
    switch (params.provider) {
      case "gemini":
        return await callGemini(params)
      case "anthropic":
        return { text: "", error: "Anthropic support not yet implemented" }
      case "openrouter":
        return { text: "", error: "OpenRouter support not yet implemented" }
      default:
        return { text: "", error: `Unknown provider: ${params.provider}` }
    }
  } catch (err: any) {
    return { text: "", error: err?.message || String(err) }
  }
}

// ========== Gemini ==========
// Models:
//   gemini-2.5-pro        — best quality, supports grounding, 100 RPD free
//   gemini-2.5-flash      — balanced, 250 RPD free
//   gemini-2.5-flash-lite — fastest/cheapest, 1000 RPD free

async function callGemini(params: AIParams): Promise<AIResult> {
  // Default model depends on whether grounding is requested.
  // gemini-2.5-flash supports Google Search grounding and is available on free tier
  // (250 RPD + 500 grounding RPD). Pro is not accessible on free tier in most regions.
  const model =
    params.model ||
    (params.useGoogleSearch ? "gemini-2.5-flash" : "gemini-2.5-flash-lite")

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(params.apiKey)}`

  const contents: any[] = []
  if (params.systemPrompt) {
    contents.push({
      role: "user",
      parts: [{ text: params.systemPrompt }],
    })
    contents.push({
      role: "model",
      parts: [{ text: "Rozumiem. Wykonam zadanie zgodnie z instrukcjami." }],
    })
  }
  contents.push({
    role: "user",
    parts: [{ text: params.userPrompt }],
  })

  const body: any = {
    contents,
    generationConfig: {
      temperature: params.temperature ?? 0.6,
      maxOutputTokens: params.maxTokens ?? 2048,
    },
  }

  // Structured JSON output
  // NOTE: responseMimeType is NOT compatible with tools like google_search
  if (params.responseFormat === "json" && !params.useGoogleSearch) {
    body.generationConfig.responseMimeType = "application/json"
  }

  // Google Search grounding (only on Pro / 2.5+ models)
  if (params.useGoogleSearch) {
    body.tools = [{ google_search: {} }]
  }

  // Retry on 429/503/504 — see header comment for policy.
  let res: Response | null = null
  let lastErrText = ""
  let lastStatus = 0
  let nonRetryableHit = false

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // 45s per-request timeout. Vercel function maxDuration=60s, so
        // 5 attempts × ~45s wouldn't fit — but in praktyce timeout fires
        // tylko gdy Google nie odpowiada wcale (network hang). Normalne
        // odpowiedzi <5s. Mirror lib/ceidg/client.ts pattern (60s tam,
        // 45s tutaj — Gemini latencja niższa niż CEIDG combo filters).
        signal: AbortSignal.timeout(45_000),
      })
    } catch (err) {
      // Network-level failure: timeout, DNS, connection refused, etc.
      const isAbort =
        err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError")
      lastStatus = isAbort ? 0 : -1
      lastErrText = err instanceof Error ? err.message : String(err)

      if (attempt === GEMINI_MAX_ATTEMPTS) {
        console.error(
          `[GEMINI] attempt ${attempt}/${GEMINI_MAX_ATTEMPTS} fetch failed (${lastErrText}) — exhausted`,
        )
        throw new GeminiUnavailableError(
          isAbort
            ? "Gemini API nie odpowiada. Spróbuj ponownie za chwilę."
            : `Gemini API błąd sieci: ${lastErrText.slice(0, 200)}. Spróbuj ponownie za chwilę.`,
          lastStatus,
          attempt,
        )
      }

      const delayMs = GEMINI_RETRY_DELAYS_MS[attempt - 1]
      console.warn(
        `[GEMINI] attempt ${attempt}/${GEMINI_MAX_ATTEMPTS} fetch failed (${lastErrText}), retry in ${delayMs / 1000}s`,
      )
      await new Promise((r) => setTimeout(r, delayMs))
      continue
    }

    if (res.ok) {
      if (attempt > 1) {
        console.log(
          `[GEMINI] attempt ${attempt}/${GEMINI_MAX_ATTEMPTS} success (status 200)`,
        )
      }
      break
    }

    lastStatus = res.status
    lastErrText = await res.text().catch(() => "")

    if (!GEMINI_RETRYABLE_STATUSES.has(res.status)) {
      // 400 / 401 / 403 / 422 — bail out, current behavior
      console.warn(
        `[GEMINI] attempt ${attempt}/${GEMINI_MAX_ATTEMPTS} non-retryable status ${res.status}`,
      )
      nonRetryableHit = true
      break
    }

    if (attempt === GEMINI_MAX_ATTEMPTS) {
      console.error(
        `[GEMINI] attempt ${attempt}/${GEMINI_MAX_ATTEMPTS} exhausted retries (last status ${res.status})`,
      )
      throw new GeminiUnavailableError(
        `Gemini API tymczasowo niedostępne (${res.status} po ${GEMINI_MAX_ATTEMPTS} próbach). Spróbuj ponownie za kilka minut.`,
        res.status,
        attempt,
      )
    }

    const delayMs = GEMINI_RETRY_DELAYS_MS[attempt - 1]
    console.warn(
      `[GEMINI] attempt ${attempt}/${GEMINI_MAX_ATTEMPTS}, status ${res.status}, retry in ${delayMs / 1000}s`,
    )
    await new Promise((r) => setTimeout(r, delayMs))
  }

  if (nonRetryableHit) {
    return {
      text: "",
      error: `Gemini API ${lastStatus}: ${lastErrText.slice(0, 500)}`,
    }
  }
  if (!res || !res.ok) {
    // Defensive — shouldn't reach here (retryable path throws above,
    // non-retryable path returns above, success path breaks).
    return {
      text: "",
      error: `Gemini API ${lastStatus || "ERR"}: ${lastErrText.slice(0, 500)}`,
    }
  }

  const data = await res.json()
  const candidate = data?.candidates?.[0]
  const text =
    candidate?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("") ||
    ""
  const tokens = data?.usageMetadata?.totalTokenCount

  // Collect grounding sources (web chunks from Google Search)
  const groundingSources: GroundingSource[] = []
  const chunks = candidate?.groundingMetadata?.groundingChunks
  if (Array.isArray(chunks)) {
    for (const ch of chunks) {
      const web = ch?.web
      if (web?.uri) {
        groundingSources.push({
          uri: web.uri,
          title: web.title || "",
        })
      }
    }
  }

  if (!text) {
    return {
      text: "",
      error: `Gemini returned empty response. Finish reason: ${
        candidate?.finishReason || "unknown"
      }`,
    }
  }

  return {
    text,
    tokensUsed: tokens,
    model,
    groundingSources: groundingSources.length ? groundingSources : undefined,
  }
}
