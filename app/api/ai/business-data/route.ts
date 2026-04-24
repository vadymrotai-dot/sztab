// app/api/ai/business-data/route.ts
// Collects structured business data about a client using Gemini 2.5 Pro with Google Search:
// verified company name, website, social media, locations, key people, additional contacts.

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { callAI, type AIProvider } from "@/lib/ai-providers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const SYSTEM_PROMPT = `Jestes researcherem B2B zbierajacym dane o polskich firmach. Wykorzystaj Google Search aby znalezc PRAWDZIWE, ZWERYFIKOWANE informacje o firmie podanej przez uzytkownika.

Szukaj:
1. Prawidlowej nazwy firmy (moga byc literowki w zapisach klienta)
2. Strony WWW (www, sklep internetowy)
3. Profili w social media (Facebook, Instagram, LinkedIn, TikTok)
4. Fizycznych lokalizacji (sklepy, magazyny, biura, punkty)
5. Kluczowych osob (wlasciciele, prezesi, menedzerowie, osoby kontaktowe)
6. Dodatkowych kontaktow (email, telefony - oprocz juz podanych)
7. Krotkiego opisu branzy i modelu biznesu

Wazne zasady:
- Jesli nie znajdujesz danej informacji - napisz "brak danych" zamiast zmyslac
- Uzywaj polskiej pisowni bez polskich znakow specjalnych (l zamiast l, a zamiast a, etc.)
- Zwroc dane w JSON w dokladnie takim formacie:

{
  "verified_name": "pelna zweryfikowana nazwa lub brak danych",
  "website": "URL strony WWW lub brak danych",
  "social": {
    "facebook": "URL lub brak danych",
    "instagram": "URL lub brak danych",
    "linkedin": "URL lub brak danych",
    "other": "URL lub brak danych"
  },
  "locations": ["adres 1", "adres 2"],
  "people": [
    {"name": "Imie Nazwisko", "role": "stanowisko"}
  ],
  "additional_contacts": {
    "emails": ["email@..."],
    "phones": ["+48..."]
  },
  "description": "krotki opis dzialalnosci (2-3 zdania, konkret)"
}

Zwroc TYLKO JSON, bez markdown, bez tekstu przed lub po.`

export async function POST(req: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Nie zalogowano" },
        { status: 401 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const clientId = String(body?.clientId || "")
    if (!clientId) {
      return NextResponse.json(
        { ok: false, error: "Brak clientId" },
        { status: 400 }
      )
    }

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
          error: "Brak klucza API. Dodaj klucz Gemini w Ustawieniach.",
        },
        { status: 400 }
      )
    }

    // Build a query that helps Gemini find the right company
    const clientDesc = [
      `Nazwa podana przez klienta: "${client.title || "brak"}"`,
      client.nip ? `NIP: ${client.nip}` : null,
      client.city ? `Miasto: ${client.city}` : null,
      client.address ? `Adres: ${client.address}` : null,
      client.email ? `Email: ${client.email}` : null,
      client.phone ? `Telefon: ${client.phone}` : null,
      client.notes
        ? `Dodatkowe notatki: ${client.notes.slice(0, 500)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n")

    const userPrompt = `Znajdz dane biznesowe nastepujacej polskiej firmy:\n\n${clientDesc}\n\nZwroc wynik w JSON zgodnie z instrukcja systemu.`

    const ai = await callAI({
      apiKey,
      provider,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      useGoogleSearch: true,
      model: "gemini-2.5-pro",
      maxTokens: 2000,
      temperature: 0.3,
    })

    if (ai.error || !ai.text) {
      return NextResponse.json(
        { ok: false, error: ai.error || "Pusta odpowiedz AI" },
        { status: 500 }
      )
    }

    // Parse JSON from AI response (strip code fences if present)
    let parsed: any = null
    try {
      const cleaned = ai.text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim()
      // Extract JSON object if wrapped in other text
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned)
    } catch (e: any) {
      return NextResponse.json(
        {
          ok: false,
          error: `Nie udalo sie sparsowac odpowiedzi AI: ${e.message}`,
          raw: ai.text.slice(0, 1000),
        },
        { status: 500 }
      )
    }

    // Build business_data JSONB object
    const businessData = {
      ...parsed,
      generated_at: new Date().toISOString(),
      sources: ai.groundingSources || [],
      model: ai.model,
    }

    // Update client record
    const updates: any = {
      business_data: businessData,
      updated_at: new Date().toISOString(),
    }

    // If we got a better website, save it separately for easy access
    if (
      parsed.website &&
      parsed.website !== "brak danych" &&
      !client.website
    ) {
      updates.website = parsed.website
    }

    // If verified name differs significantly from current, keep old as backup in notes
    // (but only if there's real verified_name, not "brak danych")
    const verified = parsed.verified_name
    if (
      verified &&
      verified !== "brak danych" &&
      verified.toLowerCase() !== (client.title || "").toLowerCase()
    ) {
      // don't auto-overwrite title — user can decide manually
    }

    const { error: uerr } = await supabase
      .from("clients")
      .update(updates)
      .eq("id", clientId)

    if (uerr) {
      return NextResponse.json(
        { ok: false, error: `Zapis nie powiodl sie: ${uerr.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      businessData,
      provider,
      model: ai.model,
      tokensUsed: ai.tokensUsed,
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Nieznany blad" },
      { status: 500 }
    )
  }
}
