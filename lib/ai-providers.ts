// lib/ai-providers.ts
// Anthropic Claude API wrapper. Replaces Gemini after 2026-04-28
// (free tier exhaustion + reliability issues). Strategy: "Claude only",
// no Gemini fallback.
//
// Reliability layer (preserved from Gemini-era hardening):
//   - Retry on 429 / 500 / 529 / network errors with exp backoff
//     (1s / 2s / 4s / 8s, 5 total attempts incl. initial)
//   - 45s per-request timeout via SDK options.timeout
//   - extractJSON 4-strategy fallback (markdown strip, prose extract,
//     control-char sanitize) — safety net dla edge cases
//   - AIInvalidResponseError dla plain-text refusals
//   - AIParseError dla malformed JSON
//   - Friendly polski error messages (caller-side via FRIENDLY_*)
//   - [CLAUDE] log prefix + token usage / estimated cost per call
//
// Public interface callAI() preserved — all 4 routes + intelligence.ts
// use it as before, just z model: AI_MODELS.X selection.

import Anthropic from '@anthropic-ai/sdk'

// ────────────────────────────────────────────────────────────
// Models (per Vadym 2026-04-28 spec)
// ────────────────────────────────────────────────────────────

export const AI_MODELS = {
  /** Claude Haiku 4.5 — cheapest, fastest. Use for parse-command,
   * simple lookups, classification. $1/$5 per 1M tokens. */
  FAST: 'claude-haiku-4-5-20251001',

  /** Claude Sonnet 4.6 — balanced quality/speed. Use for
   * potential-analysis, business-data, analyze-client, deep-discovery
   * stages. Adaptive thinking + effort supported. $3/$15 per 1M. */
  BALANCED: 'claude-sonnet-4-6',

  /** Claude Opus 4.7 — premium. Reserve for AI Master Profile
   * (Phase 2.7) or complex multi-step reasoning. $5/$25 per 1M. */
  PREMIUM: 'claude-opus-4-7',
} as const

// Pricing per 1M tokens (input / output) — kept for cost monitoring.
// Source: shared/models.md cached 2026-04-15.
const PRICING_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-7': { input: 5.0, output: 25.0 },
}

const CLAUDE_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000] as const
const CLAUDE_MAX_ATTEMPTS = CLAUDE_RETRY_DELAYS_MS.length + 1
const CLAUDE_TIMEOUT_MS = 45_000

// Models supporting adaptive thinking + effort param.
// Per shared/model-migration.md: Sonnet 4.6, Opus 4.6+, Opus 4.7.
// Haiku 4.5 NIE supports — must skip thinking config.
function supportsAdaptiveThinking(model: string): boolean {
  return model.includes('sonnet-4-6') || model.includes('opus-4-')
}

// ────────────────────────────────────────────────────────────
// Public AIResult / AIParams (preserved interface)
// ────────────────────────────────────────────────────────────

// Legacy union — Gemini removed but type preserved dla backward compat
// z callers which still pass `provider: 'gemini'`. Always routed do Claude.
export type AIProvider = 'gemini' | 'anthropic' | 'openrouter'

export interface AIParams {
  apiKey: string
  provider: AIProvider
  systemPrompt?: string
  userPrompt: string
  responseFormat?: 'text' | 'json'
  maxTokens?: number
  temperature?: number
  /** Legacy noop — Gemini grounding feature. Anthropic ma własny web
   * search tool ale Vadym wyłączył dla tego sprintu. */
  useGoogleSearch?: boolean
  /** Pełny model ID (zalecane: użyj AI_MODELS.FAST/BALANCED/PREMIUM). */
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

// ────────────────────────────────────────────────────────────
// Error classes (preserved)
// ────────────────────────────────────────────────────────────

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

export class AIInvalidResponseError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
  ) {
    super(message)
    this.name = 'AIInvalidResponseError'
  }
}

/** Renamed from GeminiUnavailableError but kept for backward compat —
 * caller catches/checks instanceof, so renaming would break. Aliased. */
export class ClaudeUnavailableError extends Error {
  constructor(
    message?: string,
    public readonly lastStatus?: number,
    public readonly attempts?: number,
  ) {
    super(
      message ??
        'Claude API tymczasowo niedostępne. Spróbuj ponownie za kilka minut.',
    )
    this.name = 'ClaudeUnavailableError'
  }
}

/** Backward-compat alias — old callers catching GeminiUnavailableError
 * keep working. New code should use ClaudeUnavailableError. */
export const GeminiUnavailableError = ClaudeUnavailableError

// ────────────────────────────────────────────────────────────
// extractJSON safety net (preserved 4-strategy fallback)
// ────────────────────────────────────────────────────────────

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

  if (!trimmed.includes('{')) {
    throw new AIInvalidResponseError(
      `Claude returned plain text instead of JSON (no '{' detected)`,
      rawText,
    )
  }

  const attempts: string[] = []

  attempts.push(trimmed)
  try {
    return JSON.parse(trimmed) as T
  } catch {
    // continue
  }

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

// ────────────────────────────────────────────────────────────
// callAI — preserved public interface, internally uses Claude
// ────────────────────────────────────────────────────────────

export async function callAI(params: AIParams): Promise<AIResult> {
  try {
    return await callClaude(params)
  } catch (err) {
    return {
      text: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ────────────────────────────────────────────────────────────
// callClaude — internal implementation
// ────────────────────────────────────────────────────────────

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheRead: number,
  cacheWrite: number,
): number {
  const prices = PRICING_PER_M_TOKENS[model] ?? PRICING_PER_M_TOKENS['claude-haiku-4-5-20251001']
  // input_tokens jest uncached remainder (skill: prompt-caching.md).
  // Cache read ~0.1×, cache write ~1.25× (default 5min TTL).
  const inputCost =
    (inputTokens * prices.input +
      cacheRead * prices.input * 0.1 +
      cacheWrite * prices.input * 1.25) /
    1_000_000
  const outputCost = (outputTokens * prices.output) / 1_000_000
  return inputCost + outputCost
}

async function callClaude(params: AIParams): Promise<AIResult> {
  if (!params.apiKey) {
    return { text: '', error: 'Brak klucza Claude API' }
  }

  const model = params.model || AI_MODELS.FAST
  const client = new Anthropic({ apiKey: params.apiKey })

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: params.userPrompt },
  ]

  // System prompt jako text block. Prompt caching pominięty bo nasze
  // system prompts (~500-1500 tokens) są poniżej minimum cacheable
  // (Sonnet 2048, Haiku 4096 per shared/prompt-caching.md). Dodaj
  // cache_control kiedy prompty urosną.
  const system: Anthropic.TextBlockParam[] | undefined = params.systemPrompt
    ? [{ type: 'text', text: params.systemPrompt }]
    : undefined

  // max_tokens default — Vadym spec said 4096; bumped from 2048 dla
  // wide-spectrum prospects podczas Gemini era, zachowane.
  const maxTokens = params.maxTokens ?? 4096

  const requestBody: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: maxTokens,
    messages,
    ...(system && { system }),
  }

  // Adaptive thinking — only Sonnet 4.6 / Opus 4.x (NOT Haiku 4.5).
  // Pomaga z reasoning-heavy zadaniami (potential-analysis, deep-discovery).
  if (supportsAdaptiveThinking(model)) {
    requestBody.thinking = { type: 'adaptive' }
  }

  // Note: temperature ignorowane na Opus 4.7 (removed parameter), ale
  // safe na Sonnet 4.6 / Haiku 4.5. Skip żeby uniknąć Opus 400 jeśli
  // ktoś przeleci PREMIUM model.
  // Vadym może chcieć temperature kontrolę później — wtedy gate by model.

  const startedAt = Date.now()
  let lastError: unknown = null

  for (let attempt = 1; attempt <= CLAUDE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await client.messages.create(requestBody, {
        timeout: CLAUDE_TIMEOUT_MS,
      })

      // Extract concatenated text from content blocks
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      )
      const text = textBlocks.map((b) => b.text).join('')

      // Cost monitoring
      const inputTokens = response.usage.input_tokens
      const outputTokens = response.usage.output_tokens
      const cacheRead = response.usage.cache_read_input_tokens ?? 0
      const cacheWrite = response.usage.cache_creation_input_tokens ?? 0
      const cost = estimateCost(model, inputTokens, outputTokens, cacheRead, cacheWrite)
      const durationMs = Date.now() - startedAt
      console.log(
        `[CLAUDE] model=${model} in=${inputTokens} out=${outputTokens} ` +
          `cache_r=${cacheRead} cache_w=${cacheWrite} ` +
          `cost=$${cost.toFixed(4)} duration=${durationMs}ms attempt=${attempt}`,
      )

      if (!text) {
        return {
          text: '',
          error: `Claude zwrócił pustą odpowiedź. Stop reason: ${response.stop_reason ?? 'unknown'}`,
        }
      }

      return {
        text,
        tokensUsed: inputTokens + outputTokens,
        model: response.model,
      }
    } catch (err) {
      lastError = err

      // Typed exceptions per skill recommendation — instanceof checks
      // od najbardziej specific do najbardziej general.

      if (err instanceof Anthropic.AuthenticationError) {
        // 401 — bad API key, no retry
        console.error(`[CLAUDE] auth failed (401):`, err.message)
        return {
          text: '',
          error:
            'Klucz Claude API niepoprawny lub wygasł. Zaktualizuj w params.anthropic_api_key.',
        }
      }

      if (err instanceof Anthropic.PermissionDeniedError) {
        // 403
        console.error(`[CLAUDE] permission denied (403):`, err.message)
        return {
          text: '',
          error: `Claude API: brak uprawnień (403). ${err.message.slice(0, 200)}`,
        }
      }

      if (err instanceof Anthropic.NotFoundError) {
        // 404 — bad model ID
        console.error(`[CLAUDE] model not found (404): ${model}`, err.message)
        return {
          text: '',
          error: `Claude API: nieprawidłowy model "${model}" (404).`,
        }
      }

      if (err instanceof Anthropic.BadRequestError) {
        // 400 — request shape issue (bad params, etc.)
        console.error(`[CLAUDE] bad request (400):`, err.message)
        return {
          text: '',
          error: `Claude API 400: ${err.message.slice(0, 300)}`,
        }
      }

      // Determine if retryable
      const isAbort =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      const isRetryable =
        err instanceof Anthropic.RateLimitError ||
        err instanceof Anthropic.InternalServerError ||
        (err instanceof Anthropic.APIError && err.status === 529) ||
        isAbort

      if (!isRetryable) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(
          `[CLAUDE] attempt ${attempt}/${CLAUDE_MAX_ATTEMPTS} non-retryable:`,
          message,
        )
        return { text: '', error: `Claude API błąd: ${message.slice(0, 300)}` }
      }

      if (attempt === CLAUDE_MAX_ATTEMPTS) {
        const status = err instanceof Anthropic.APIError ? err.status : 0
        console.error(
          `[CLAUDE] attempt ${attempt}/${CLAUDE_MAX_ATTEMPTS} exhausted retries (last status ${status})`,
        )
        throw new ClaudeUnavailableError(
          isAbort
            ? 'Claude API nie odpowiada. Spróbuj ponownie za chwilę.'
            : `Claude API tymczasowo niedostępne (${status} po ${CLAUDE_MAX_ATTEMPTS} próbach). Spróbuj ponownie za kilka minut.`,
          status,
          attempt,
        )
      }

      const delayMs = CLAUDE_RETRY_DELAYS_MS[attempt - 1]
      const status =
        err instanceof Anthropic.APIError ? err.status : isAbort ? 'timeout' : 'network'
      console.warn(
        `[CLAUDE] attempt ${attempt}/${CLAUDE_MAX_ATTEMPTS}, status ${status}, retry in ${delayMs / 1000}s`,
      )
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  // Defensive — shouldn't reach (loop either returns or throws)
  throw lastError instanceof Error
    ? lastError
    : new Error('Claude call failed: unknown')
}
