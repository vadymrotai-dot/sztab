// app/api/ai/analyze-client/route.ts
// Takes a client ID, reads client data from Supabase, asks AI (Gemini by default)
// to write a structured Polish business analysis, appends to client.notes.

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { callAI, type AIProvider } from "@/lib/ai-providers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SYSTEM_PROMPT = `Jesteś ekspertem sprzedaży B2B w branży spożywczej — konkretnie kiszonek, surówek i sałatek. Firma Ziomek Fish importuje te produkty z Ukrainy do Polski i sprzedaje w hurcie sklepom, delikatesom, restauracjom, hurtowniam spożywczym i firmom gastronomicznym.

Twoim zadaniem jest przeanalizować potencjalnego klienta i napisać zwięzły profil biznesowy po polsku w 4 sekcjach (każda po 2-4 zdania):

1. **PROFIL DZIAŁALNOŚCI** — czym zajmuje się firma, jej branża, skala działania
2. **POTENCJAŁ** — czy produkty Ziomek Fish pasują do tego klienta, jaki wolumen zamówień można oczekiwać, jakie produkty najbardziej pasują
3. **STRATEGIA** — jak podejść do sprzedaży (kanały, osoby decyzyjne, punkty zaczepienia), jaki segment cenowy sugerować (mały opt / średni opt / duży opt / katalog / docel)
4. **RYZYKA** — potencjalne problemy lub zastrzeżenia

Pisz konkretnie i rzeczowo, bez ogólników. Jeśli brakuje informacji, napisz "brak danych" zamiast zmyślać.`

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
    const clientId = String(body?.clientId || "")
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "Brak clientId" }, { status: 400 })
    }

    // Load client
    const { data: client, error: cerr } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single()
    if (cerr || !client) {
      return NextResponse.json(
        { ok: false, error: "Nie znaleziono klienta" },
        { status: 404 }
      )
    }

    // Load API key from params
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
          error:
            "Brak klucza API. Dodaj klucz Gemini / Anthropic / OpenRouter w Ustawieniach.",
        },
        { status: 400 }
      )
    }

    const clientDesc = [
      `Nazwa firmy: ${client.title || "brak"}`,
      client.nip ? `NIP: ${client.nip}` : null,
      client.city ? `Miasto: ${client.city}` : null,
      client.address ? `Adres: ${client.address}` : null,
      client.region ? `Region: ${client.region}` : null,
      client.industry ? `Branża (kod Bitrix): ${client.industry}` : null,
      client.email ? `Email: ${client.email}` : null,
      client.phone ? `Telefon: ${client.phone}` : null,
      client.notes
        ? `\nNotatki i dodatkowe informacje:\n${client.notes.slice(0, 2000)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n")

    const userPrompt = `Przeanalizuj następującego potencjalnego klienta dla Ziomek Fish:\n\n${clientDesc}\n\nNapisz profil w 4 sekcjach zgodnie z instrukcjami systemu.`

    const ai = await callAI({
      apiKey,
      provider,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 1500,
      temperature: 0.5,
    })

    if (ai.error || !ai.text) {
      return NextResponse.json(
        { ok: false, error: ai.error || "Pusta odpowiedź AI" },
        { status: 500 }
      )
    }

    // Append to notes (with timestamp marker)
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ")
    const block = `\n\n--- Analiza AI (${stamp}, ${ai.model || provider}) ---\n${ai.text.trim()}`
    const newNotes = (client.notes || "") + block

    const { error: uerr } = await supabase
      .from("clients")
      .update({ notes: newNotes, updated_at: new Date().toISOString() })
      .eq("id", clientId)

    if (uerr) {
      return NextResponse.json(
        { ok: false, error: `Zapis nie powiódł się: ${uerr.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      analysis: ai.text,
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
