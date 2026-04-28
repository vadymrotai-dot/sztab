// app/api/ai/potential-analysis/route.ts
// Analyzes client's potential for cooperation with Ziomek Fish,
// recommends segment, strategy, offer ideas, risks.
// Uses Google Search for informed decisions.

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  callAI,
  extractJSON,
  AIParseError,
  AIInvalidResponseError,
  type AIProvider,
} from "@/lib/ai-providers"

const FRIENDLY_PARSE_ERROR =
  "Nie udało się przetworzyć odpowiedzi AI dla tego klienta. Spróbuj ponownie za chwilę."

const FRIENDLY_INVALID_RESPONSE =
  "Gemini nie zwrócił prawidłowej odpowiedzi. To czasem zdarza się dla skomplikowanych klientów (35+ kodów PKD). Spróbuj ponownie lub uprość zapytanie."

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const SYSTEM_PROMPT = `Jestes ekspertem sprzedazy B2B w branzy spozywczej specjalizujacej sie w kiszonkach, surowkach i salatkach.

Firma Ziomek Fish Sp. z o.o. (Warszawa) importuje kiszonki i surowki z Ukrainy (marka Chudova Marka) i sprzedaje hurtowo w Polsce. Produkty:
- Kiszonki: kapusta kiszona, kapusta z zurawina, kapusta z paprycka, ogorki kiszone, pomidory kiszone
- Surowki: tradycyjna (kapusta+paprika+marchew), z burakami, "Peluska", z marchwi po koreansku, ze swiezej kapusty w marynacie
- Salatki: z burakow, bakłażana
- Opakowania: 300-5000g, sprzedawane w hurcie do sklepow, restauracji, delikatesow, hurtowni

Cennik ma 5 poziomow marzy (segmentow):
- "maly_opt" (marza 50%, zamowienia <1000 PLN) - male sklepy, osiedlowe delikatesy
- "sredni_opt" (marza 40%, zamowienia 1000-2500 PLN) - sklepy spozywcze srednie
- "duzy_opt" (marza 35%, zamowienia >2500 PLN) - hurtownie, wieksi detaliscie
- "katalog" (marza 32%) - duzi gracze, sieci sklepow, start negocjacji
- "docel" (marza 23%) - strategiczni partnerzy z gwarancja wolumenu

Twoje zadanie: przeanalizuj klienta i OCEN TRZEŹWO czy produkty Ziomek Fish pasuja do niego. Uzywaj Google Search aby potwierdzic jaki naprawde biznes prowadzi klient.

Rzeczywistosc biznesowa:
- Sklep z piwem kraftowym - snack do piwa (ogorki, kiszonki) tak, ale maly wolumen
- Mala restauracja - tak ale bardzo malo
- Kuchnia ukrainska / wschodnioslowianska - tak, idealne dopasowanie (duzy wolumen)
- Delikatesy - moze pojedyncze produkty premium
- Hurtownia spozywcza - tak, dystrybucja dalej
- Sklep monoproduktowy (np. tylko alkohol bez jedzenia) - NIE pasuje w ogole
- Firma IT, uslugowa, B2B bez gastronomii - NIE pasuje

Zwroc wynik TYLKO w JSON, bez markdown:

{
  "potential_score": 0-10 (0 = nie pasuje, 10 = idealne dopasowanie),
  "recommended_segment": "niesklasyfikowany|maly_opt|sredni_opt|duzy_opt|katalog|docel",
  "potential_summary": "2-4 zdania konkretnej oceny dopasowania produktow do tego klienta",
  "strategy": "2-4 zdania jak podejsc do tego klienta (kanal komunikacji, osoby, argumenty)",
  "offer_recommendations": "2-4 zdania jakie konkretne produkty i w jakiej kwocie proponowac na start",
  "risks": "2-4 zdania jakie ryzyka, problemy lub znaki ostrzegawcze"
}

Jesli klient wyraznie nie pasuje (np. firma IT) - potential_score=0-2, recommended_segment="niesklasyfikowany", potential_summary napisz szczerze ze nie pasuje i DLACZEGO.

KRYTYCZNE FORMATOWANIE JSON:
- ZWRÓĆ TYLKO valid JSON. Zacznij od { i zakończ }.
- BEZ markdown, BEZ \`\`\`json bloków, BEZ prozy przed/po.
- W stringach używaj \\n dla nowych linii (NIE raw newlines).
- Polskie znaki ą/ę/ć/ł zostaw jak są — UTF-8 OK.
- ZAWSZE zwróć valid JSON object {...}. NIGDY nie odpowiadaj plain tekstem.
- Jeśli nie potrafisz wygenerować analizy (brak danych, klient niejasny,
  PKD zbyt szerokie), zwróć: {"error": "insufficient_data", "reason": "krótki opis dlaczego"}
  zamiast plain text błędu.`

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
        { ok: false, error: "Brak klucza API. Dodaj klucz Gemini w Ustawieniach." },
        { status: 400 }
      )
    }

    // Build context - prefer business_data if already collected
    const bd = client.business_data || {}
    const contextLines = [
      `Nazwa firmy: ${bd.verified_name || client.title || "brak"}`,
      client.nip ? `NIP: ${client.nip}` : null,
      client.city ? `Miasto: ${client.city}` : null,
      client.address ? `Adres: ${client.address}` : null,
      bd.website || client.website ? `Strona WWW: ${bd.website || client.website}` : null,
      bd.description ? `Opis dzialalnosci: ${bd.description}` : null,
      bd.locations?.length ? `Lokalizacje: ${bd.locations.join("; ")}` : null,
      bd.people?.length
        ? `Osoby: ${bd.people.map((p: any) => `${p.name} (${p.role})`).join("; ")}`
        : null,
      client.notes
        ? `Dodatkowe notatki: ${client.notes.slice(0, 1000)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n")

    const userPrompt = `Oceniasz potencjal wspolpracy nastepujacego klienta z Ziomek Fish:\n\n${contextLines}\n\nZwroc JSON z ocena zgodnie z instrukcja systemu. Jesli potrzebujesz, sprawdz firme przez Google Search.`

    const ai = await callAI({
      apiKey,
      provider,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      useGoogleSearch: true,
      model: "gemini-2.5-flash",
      // Bumped 1500→4096: wide-spectrum prospects (35+ PKD codes) + Google
      // grounding metadata generated truncated JSON powodując "Unterminated
      // string" parse errors. 4096 tokens daje bezpieczny bufor.
      maxTokens: 4096,
      temperature: 0.4,
    })

    if (ai.error || !ai.text) {
      return NextResponse.json(
        { ok: false, error: ai.error || "Pusta odpowiedz AI" },
        { status: 500 }
      )
    }

    let parsed: any = null
    try {
      parsed = extractJSON<any>(ai.text)
    } catch (e: any) {
      // Differentiate failure modes:
      //  - AIInvalidResponseError: Gemini zwrócił plain text (refusal /
      //    hallucinated error). Specific friendly message.
      //  - AIParseError: malformed JSON despite { detected. Generic msg.
      //  - other: log + generic msg.
      if (e instanceof AIInvalidResponseError) {
        console.error("[AI_INVALID_RESPONSE] potential-analysis", {
          message: e.message,
          rawLength: e.rawText.length,
          rawPreview: e.rawText.slice(0, 2000),
        })
        return NextResponse.json(
          { ok: false, error: FRIENDLY_INVALID_RESPONSE },
          { status: 502 }
        )
      }
      if (e instanceof AIParseError) {
        console.error("[AI_PARSE_ERROR] potential-analysis", {
          message: e.message,
          rawLength: e.rawText.length,
          rawPreview: e.rawText.slice(0, 2000),
          cleanedPreview: e.cleaned?.slice(0, 2000),
        })
      } else {
        console.error("[AI_PARSE_ERROR] potential-analysis (unknown)", e)
      }
      return NextResponse.json(
        { ok: false, error: FRIENDLY_PARSE_ERROR },
        { status: 500 }
      )
    }

    // Handle AI-generated insufficient_data signal — model explicit
    // refused to score (per strengthened prompt). Return friendly
    // message instead of writing garbage to potential_analysis JSONB.
    if (parsed && typeof parsed === "object" && parsed.error === "insufficient_data") {
      console.warn("[AI_INSUFFICIENT_DATA] potential-analysis", {
        clientId,
        reason: parsed.reason,
      })
      return NextResponse.json(
        {
          ok: false,
          error: `Gemini nie ma dość danych aby ocenić tego klienta: ${parsed.reason || "brak szczegółów"}`,
        },
        { status: 422 }
      )
    }

    const potentialAnalysis = {
      ...parsed,
      generated_at: new Date().toISOString(),
      sources: ai.groundingSources || [],
      model: ai.model,
    }

    // Map recommended_segment to valid values
    const segmentMap: Record<string, string> = {
      niesklasyfikowany: "niesklasyfikowany",
      maly_opt: "maly_opt",
      "maly opt": "maly_opt",
      sredni_opt: "sredni_opt",
      "sredni opt": "sredni_opt",
      duzy_opt: "duzy_opt",
      "duzy opt": "duzy_opt",
      katalog: "katalog",
      docel: "docel",
    }
    const validSegment = segmentMap[(parsed.recommended_segment || "").toLowerCase()]

    const updates: any = {
      potential_analysis: potentialAnalysis,
      updated_at: new Date().toISOString(),
    }

    // Auto-update segment if AI recommended something and client is still niesklasyfikowany
    if (validSegment && client.segment === "niesklasyfikowany") {
      updates.segment = validSegment
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
      potentialAnalysis,
      autoAssignedSegment: updates.segment || null,
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
