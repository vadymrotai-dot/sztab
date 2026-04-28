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
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

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
