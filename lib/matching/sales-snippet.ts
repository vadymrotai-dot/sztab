// lib/matching/sales-snippet.ts
// Sprint G / L7 lite — generate cold-opener + value-prop + objection
// snippet per match. On-demand only (UI button), результат cached в
// matches.sales_snippet JSONB.
//
// Scope: ONLY JDG (не chains/HQ — see warning у system prompt).

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAI, AI_MODELS, extractJSON } from '@/lib/ai-providers'

export interface SalesSnippet {
  opener_pl: string
  value_prop_pl: string
  objection_likely: string
  generated_at: string
}

export interface SnippetResult {
  match_id: string
  snippet: SalesSnippet | null
  cost_usd: number
  duration_ms: number
  error?: string
}

const SYSTEM_PROMPT = `Jesteś senior sprzedawcą B2B w polskim biznesie HoReCa. Tworzysz krótkie, profesjonalne i konkretne wiadomości otwierające do potencjalnych klientów (drobni przedsiębiorcy JDG, małe sklepy spożywcze, gastronomia).

ZASADY:
- Klient to drobny przedsiębiorca (JDG / mała firma). NIE jest to centrala sieci ani sieciowy supermarket — pisz odpowiednio do osoby, nie do działu zakupów.
- Polski formalny ale ciepły ton ("Pan/Pani", nie "ty").
- Konkrety > general statements. Jeśli wiesz nazwę firmy + miasto + kategoria PKD, użyj tego.
- Krótko — opener 2-3 zdania, value_prop 2-3 zdania, objection 1 zdanie.
- BEZ haseł sprzedażowych typu "rewolucyjny", "najlepszy", "wyjątkowy".

OUTPUT: czysty JSON, bez preambuły, bez markdown. Format:
{"opener_pl": "...", "value_prop_pl": "...", "objection_likely": "..."}`

interface MatchRowFull {
  id: string
  client_id: string | null
  prospect_id: string | null
  product_id: string
  algo_score: number
  ai_score: number | null
  ai_reasoning: string | null
  reason_codes: string[]
}

interface TargetLite {
  name: string
  city: string | null
  pkd: string[]
  vat_status: string | null
  legal_form: string | null
  type: 'client' | 'prospect'
}

interface ProductLite {
  name: string
  brand: string | null
  family_pl: string | null
  gramatura: string | null
}

export async function generateSalesSnippet(
  supabase: SupabaseClient,
  apiKey: string,
  matchId: string,
): Promise<SnippetResult> {
  const startedAt = Date.now()
  const out: SnippetResult = {
    match_id: matchId,
    snippet: null,
    cost_usd: 0,
    duration_ms: 0,
  }

  if (!apiKey) {
    out.error = 'ANTHROPIC_API_KEY missing'
    out.duration_ms = Date.now() - startedAt
    return out
  }

  // 1. Load match
  const { data: matchRow } = await supabase
    .from('matches')
    .select('id, client_id, prospect_id, product_id, algo_score, ai_score, ai_reasoning, reason_codes')
    .eq('id', matchId)
    .single()
  if (!matchRow) {
    out.error = 'match not found'
    out.duration_ms = Date.now() - startedAt
    return out
  }
  const match = matchRow as MatchRowFull

  // 2. Load product + family
  const { data: prodRow } = await supabase
    .from('products')
    .select('id, name, brand, gramatura, family_id')
    .eq('id', match.product_id)
    .single()
  if (!prodRow) {
    out.error = 'product not found'
    out.duration_ms = Date.now() - startedAt
    return out
  }
  const productRecord = prodRow as { id: string; name: string; brand: string | null; gramatura: string | null; family_id: string | null }
  let familyName: string | null = null
  if (productRecord.family_id) {
    const { data: famRow } = await supabase
      .from('taxonomy_families')
      .select('name_pl')
      .eq('id', productRecord.family_id)
      .single()
    familyName = (famRow as { name_pl?: string } | null)?.name_pl ?? null
  }
  const product: ProductLite = {
    name: productRecord.name,
    brand: productRecord.brand,
    family_pl: familyName,
    gramatura: productRecord.gramatura,
  }

  // 3. Load target
  let target: TargetLite | null = null
  if (match.client_id) {
    const { data: c } = await supabase
      .from('clients')
      .select('title, city, pkd_2007_codes, vat_status, krs_legal_form')
      .eq('id', match.client_id)
      .single()
    if (c) {
      target = {
        type: 'client',
        name: (c as { title: string }).title,
        city: (c as { city: string | null }).city ?? null,
        pkd: (c as { pkd_2007_codes: string[] | null }).pkd_2007_codes ?? [],
        vat_status: (c as { vat_status: string | null }).vat_status,
        legal_form: (c as { krs_legal_form: string | null }).krs_legal_form,
      }
    }
  } else if (match.prospect_id) {
    const { data: p } = await supabase
      .from('ceidg_prospects')
      .select('name, miejscowosc, pkd_main, pkd_all, vat_status')
      .eq('id', match.prospect_id)
      .single()
    if (p) {
      const pkdAll = new Set<string>()
      const ppkd = p as { pkd_main: string | null; pkd_all: string[] | null }
      if (ppkd.pkd_main) pkdAll.add(ppkd.pkd_main)
      if (ppkd.pkd_all) for (const c of ppkd.pkd_all) if (c) pkdAll.add(c)
      target = {
        type: 'prospect',
        name: (p as { name: string }).name,
        city: (p as { miejscowosc: string | null }).miejscowosc ?? null,
        pkd: Array.from(pkdAll),
        vat_status: (p as { vat_status: string | null }).vat_status,
        legal_form: 'JDG',
      }
    }
  }
  if (!target) {
    out.error = 'target not found'
    out.duration_ms = Date.now() - startedAt
    return out
  }

  // 4. Build prompt
  const userPrompt = `KLIENT (JDG/mała firma):
- Nazwa: ${target.name}
- Miasto: ${target.city ?? 'brak'}
- Forma prawna: ${target.legal_form ?? 'JDG'}
- PKD: ${target.pkd.slice(0, 5).join(', ') || 'brak'}
- VAT: ${target.vat_status ?? 'nieznany'}

PRODUKT:
- Nazwa: ${product.name}${product.gramatura ? ` (${product.gramatura})` : ''}
- Marka: ${product.brand ?? '?'}
- Family: ${product.family_pl ?? '?'}

KONTEKST AI:
- Score: algo=${match.algo_score}${match.ai_score !== null ? `, ai=${match.ai_score}` : ''}
${match.ai_reasoning ? `- Uzasadnienie: ${match.ai_reasoning}` : ''}
- Reason codes: ${match.reason_codes.slice(0, 4).join(', ')}

Wygeneruj JSON {opener_pl, value_prop_pl, objection_likely} dla cold outreach.`

  // 5. Call Claude
  const ai = await callAI({
    apiKey,
    provider: 'anthropic',
    model: AI_MODELS.FAST,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 800,
    temperature: 0.5,
  })

  if (ai.error || !ai.text) {
    out.error = ai.error ?? 'empty AI response'
    out.duration_ms = Date.now() - startedAt
    return out
  }

  // 6. Parse + persist
  let parsed: { opener_pl?: string; value_prop_pl?: string; objection_likely?: string }
  try {
    parsed = extractJSON<typeof parsed>(ai.text)
  } catch (err) {
    out.error = `parse failed: ${err instanceof Error ? err.message : String(err)}`
    out.duration_ms = Date.now() - startedAt
    return out
  }

  const snippet: SalesSnippet = {
    opener_pl: (parsed.opener_pl ?? '').slice(0, 1000),
    value_prop_pl: (parsed.value_prop_pl ?? '').slice(0, 1000),
    objection_likely: (parsed.objection_likely ?? '').slice(0, 500),
    generated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('matches')
    .update({ sales_snippet: snippet })
    .eq('id', matchId)
  if (error) {
    out.error = `db update: ${error.message}`
    out.duration_ms = Date.now() - startedAt
    return out
  }

  out.snippet = snippet
  // Approx Haiku cost: ~600 in + ~400 out = ~1000 tokens, 50/50 split.
  const tokens = ai.tokensUsed ?? 1000
  out.cost_usd = Math.round((tokens * 0.5 * 1.0 + tokens * 0.5 * 5.0) / 1_000_000 * 10000) / 10000
  out.duration_ms = Date.now() - startedAt
  return out
}
