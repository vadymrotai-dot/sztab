// app/api/ai/parse-command/route.ts
// Takes free-form text ("Dodaj klienta HAKON z NIP 9512560103") and returns
// a structured JSON action that the frontend can execute.

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  callAI,
  extractJSON,
  AIParseError,
  AIInvalidResponseError,
  type AIProvider,
} from "@/lib/ai-providers"
import {
  validateAIResponse,
  AISchemaInvalidError,
  ParseCommandSchema,
} from "@/lib/ai/schemas"

const FRIENDLY_PARSE_ERROR =
  "Nie udało się przetworzyć komendy. Spróbuj ponownie."

const FRIENDLY_INVALID_RESPONSE =
  "Gemini nie zwrócił prawidłowej odpowiedzi. Spróbuj ponownie."

const FRIENDLY_SCHEMA_INVALID =
  "AI zwróciło dane w nieprawidłowym formacie. Spróbuj ponownie."

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SYSTEM_PROMPT = `Jesteś parserem komend głosowych dla CRM Sztab (sprzedaż kiszonek w hurcie B2B).

Użytkownik wypowiada krótką komendę po polsku, po ukraińsku lub po angielsku. Twoim zadaniem jest zwrócić CZYSTY JSON (bez markdown, bez komentarzy) opisujący akcję do wykonania.

Dostępne akcje i ich schematy:

1) Dodaj nowego klienta:
{
  "action": "create_client",
  "payload": {
    "title": "string — nazwa firmy",
    "nip": "string — 10 cyfr lub null",
    "city": "string lub null",
    "segment": "'mały opt'|'średni opt'|'duży opt'|'katalog'|'docel'|'niesklasyfikowany'",
    "notes": "string lub null"
  }
}

2) Dodaj zadanie:
{
  "action": "create_task",
  "payload": {
    "title": "string",
    "due": "YYYY-MM-DD lub null",
    "priority": "'low'|'normal'|'high'",
    "sphere": "'praca'|'zycie'|'zdrowie'|'finanse'",
    "clientTitle": "string lub null (jeśli zadanie dotyczy konkretnego klienta)"
  }
}

3) Dodaj umowę/szansę sprzedaży:
{
  "action": "create_deal",
  "payload": {
    "title": "string",
    "clientTitle": "string lub null",
    "stage": "'lead'|'oferta'|'negocjacje'|'sample'|'kontrakt'|'wygrana'|'przegrana'",
    "amount": "number PLN lub 0"
  }
}

4) Wyszukaj klienta:
{
  "action": "search_client",
  "payload": {
    "query": "string"
  }
}

5) Niezrozumiała komenda:
{
  "action": "unknown",
  "payload": {
    "reason": "string — dlaczego nie rozumiesz"
  }
}

Ważne zasady:
- Zwróć TYLKO obiekt JSON, nic więcej. Bez markdown, bez backticków, bez wyjaśnień.
- Jeśli w komendzie jest NIP (10 cyfr, może z myślnikami), wyciągnij go do pola nip.
- Jeśli komenda zawiera segment cenowy ("średni opt", "duży opt", "katalog", itd.), przypisz go poprawnie.
- Data "dzisiaj" = today ISO date, "jutro" = tomorrow ISO date, "pojutrze" = day after tomorrow. Jeśli nie podano, użyj null.`

export async function POST(req: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Nie zalogowano" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const text = String(body?.text || "").trim()
    if (!text) {
      return NextResponse.json({ ok: false, error: "Brak tekstu" }, { status: 400 })
    }

    const { data: params } = await supabase
      .from("params")
      .select("gemini_key, anthropic_key, openrouter_key")
      .single()

    const provider: AIProvider = params?.gemini_key
      ? "gemini"
      : params?.anthropic_key
        ? "anthropic"
        : "openrouter"
    const apiKey =
      (provider === "gemini" && params?.gemini_key) ||
      (provider === "anthropic" && params?.anthropic_key) ||
      (provider === "openrouter" && params?.openrouter_key) ||
      ""

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Brak klucza API. Dodaj w Ustawieniach.",
        },
        { status: 400 }
      )
    }

    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

    const userPrompt = `Dzisiejsza data: ${today}. Jutrzejsza: ${tomorrow}.\n\nKomenda użytkownika:\n"${text}"\n\nZwróć JSON z akcją.`

    const ai = await callAI({
      apiKey,
      provider,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      responseFormat: "json",
      maxTokens: 500,
      temperature: 0.2,
    })

    if (ai.error || !ai.text) {
      return NextResponse.json(
        { ok: false, error: ai.error || "Pusta odpowiedź AI" },
        { status: 500 }
      )
    }

    let parsed: unknown
    try {
      parsed = extractJSON(ai.text)
    } catch (e: any) {
      if (e instanceof AIInvalidResponseError) {
        console.error("[AI_INVALID_RESPONSE] parse-command", {
          rawPreview: e.rawText.slice(0, 1000),
        })
        return NextResponse.json(
          { ok: false, error: FRIENDLY_INVALID_RESPONSE },
          { status: 502 }
        )
      }
      if (e instanceof AIParseError) {
        console.error("[AI_PARSE_ERROR] parse-command", {
          message: e.message,
          rawPreview: e.rawText.slice(0, 1000),
        })
      } else {
        console.error("[AI_PARSE_ERROR] parse-command (unknown)", e)
      }
      return NextResponse.json(
        { ok: false, error: FRIENDLY_PARSE_ERROR },
        { status: 500 }
      )
    }

    // Schema validation — discriminated union (5 action variants)
    let validated: import("@/lib/ai/schemas").ParseCommandResult
    try {
      validated = validateAIResponse(parsed, ParseCommandSchema, "parse-command")
    } catch (e: any) {
      if (e instanceof AISchemaInvalidError) {
        console.error("[AI_SCHEMA_INVALID] parse-command", {
          context: e.context,
          issues: e.issues,
          rawPreview: JSON.stringify(e.raw).slice(0, 1000),
        })
      } else {
        console.error("[AI_SCHEMA_INVALID] parse-command (unknown)", e)
      }
      return NextResponse.json(
        { ok: false, error: FRIENDLY_SCHEMA_INVALID },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      result: validated,
      provider,
      model: ai.model,
      tokensUsed: ai.tokensUsed,
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Nieznany błąd" },
      { status: 500 }
    )
  }
}
