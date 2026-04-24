// lib/ai-providers.ts
// Universal AI provider interface. Currently supports Gemini.
// To add Anthropic/OpenRouter later — just add a new case in callAI() and a function below.

export type AIProvider = "gemini" | "anthropic" | "openrouter"

export interface AIParams {
  apiKey: string
  provider: AIProvider
  systemPrompt?: string
  userPrompt: string
  responseFormat?: "text" | "json"
  maxTokens?: number
  temperature?: number
}

export interface AIResult {
  text: string
  tokensUsed?: number
  model?: string
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
// Docs: https://ai.google.dev/gemini-api/docs/text-generation
// Free tier model: gemini-2.5-flash-lite (15 RPM, 1000 RPD)

async function callGemini(params: AIParams): Promise<AIResult> {
  const model = "gemini-2.5-flash-lite"
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

  if (params.responseFormat === "json") {
    body.generationConfig.responseMimeType = "application/json"
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    return { text: "", error: `Gemini API ${res.status}: ${errText.slice(0, 500)}` }
  }

  const data = await res.json()
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || ""
  const tokens = data?.usageMetadata?.totalTokenCount

  if (!text) {
    return {
      text: "",
      error: `Gemini returned empty response. Finish reason: ${data?.candidates?.[0]?.finishReason || "unknown"}`,
    }
  }

  return { text, tokensUsed: tokens, model }
}
