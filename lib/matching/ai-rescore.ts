// lib/matching/ai-rescore.ts
// Sprint G — L6 AI re-score top-20 matches per product.
//
// Pipeline:
//   1. SELECT top 20 matches WHERE product_id=? ORDER BY algo_score DESC
//   2. Enrich z target details (clients/prospects)
//   3. Single Claude Haiku 4.5 call із structured JSON output
//   4. UPDATE ai_score / ai_reasoning / ai_confidence / ai_scored_at
//
// Scope: ONLY JDG entities (CEIDG prospects + GUS-enriched clients).
// AI is briefed accordingly — no halucinations про chains/HQ buyers.
//
// Cost: ~$0.02 per call (Haiku 4.5, ~1500 in + 1500 out tokens).
// Bulk на 35 products = ~$0.70.

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAI, AI_MODELS, extractJSON } from '@/lib/ai-providers'

export interface RescoreItem {
  match_id: string
  ai_score: number
  ai_reasoning: string
  ai_confidence: number
}

export interface RescoreSummary {
  product_id: string
  product_name: string
  candidates_count: number
  rescored_count: number
  cost_usd: number
  duration_ms: number
  ai_score_min: number
  ai_score_max: number
  error?: string
}

interface MatchRow {
  id: string
  client_id: string | null
  prospect_id: string | null
  algo_score: number
  reason_codes: string[]
}

interface ProductRow {
  id: string
  name: string
  brand: string | null
  family_id: string | null
  gramatura: string | null
  category: string | null
}

interface FamilyRow {
  id: string
  name_pl: string
}

interface ClientLite {
  id: string
  title: string
  nip: string | null
  region: string | null
  vat_status: string | null
  krs_legal_form: string | null
  pkd_2007_codes: string[] | null
}

interface ProspectLite {
  id: string
  name: string
  nip: string | null
  miejscowosc: string | null
  wojewodztwo: string | null
  vat_status: string | null
  pkd_main: string | null
  pkd_all: string[] | null
}

const MAX_CANDIDATES = 20
const MAX_BULK_COST_USD = 5.0
const HAIKU_INPUT_PER_M = 1.0
const HAIKU_OUTPUT_PER_M = 5.0

const SYSTEM_PROMPT = `Jesteś analitykiem sprzedaży B2B HoReCa w Polsce. Twoja praca: ocenić realistyczne prawdopodobieństwo, że dany kandydat (drobny przedsiębiorca lub firma JDG: gastronomia, sklep spożywczy, dystrybucja) zakupi konkretny produkt.

KONTEKST:
- Wszyscy kandydaci to drobni gracze — JDG (jednoosobowa działalność gospodarcza) lub mała sp. z o.o. NIE są to centrale sieci, supermarketów ani korporacyjni nabywcy. Nie zgaduj zakupów HQ/centralnych — kandydaci kupują indywidualnie.
- Algorytmiczny pre-score (algo_score) bazuje na PKD-fit + status VAT/GUS + ogólne sygnały. Twoje zadanie: doprecyzować ten sygnał korzystając z wiedzy domenowej.

ZASADY OCENY:
- Wysoki score (70-100) — PKD jednoznacznie wskazuje na zakup tego typu produktu (np. 56.10.A restauracja kupuje sałatki gotowe; 47.21.Z sklep z warzywami kupuje kiszonki).
- Średni score (40-69) — PKD adjacent (np. 47.11.Z ogólny sklep spożywczy może kupić kiszonki, ale ma asortyment ogólny; 56.30.Z bar może kupić ale to nie core).
- Niski score (0-39) — PKD pokazuje niedopasowanie (np. transport drogowy 49.41.Z, działalność medyczna 86.x — zakup mało prawdopodobny).
- Status VAT czynny + GUS active = +5-10 do bazowej oceny (firma operuje).
- Status nieznany — neutral, nie penalize.

OUTPUT: czysty JSON, bez preambuły, bez markdown. Format ŚCIŚLE:
{"rescored": [{"id": "<match_id>", "ai_score": <0-100>, "reasoning": "<1 zdanie PL, max 120 znaków>", "confidence": <0.0-1.0>}, ...]}

Jeden obiekt per kandydat, w tej samej kolejności co input. confidence: 0.9+ dla jasnych match/no-match, 0.5-0.7 dla ambiguous (np. 47.11.Z general retail).`

function buildUserPrompt(
  product: ProductRow,
  family: FamilyRow | null,
  candidates: Array<{
    match: MatchRow
    target_type: 'client' | 'prospect'
    target_name: string
    target_pkd: string[]
    target_meta: string[]
  }>,
): string {
  const familyName = family?.name_pl ?? '?'
  const productLine = `${product.name}${product.gramatura ? ` (${product.gramatura})` : ''}, marka=${product.brand ?? '?'}, Family="${familyName}"${product.category ? `, kategoria=${product.category}` : ''}`

  const lines = candidates.map((c, i) => {
    const meta = c.target_meta.length > 0 ? `, ${c.target_meta.join(', ')}` : ''
    const pkd = c.target_pkd.length > 0 ? c.target_pkd.slice(0, 6).join(',') : '-'
    return `[${i + 1}] id="${c.match.id}", ${c.target_type}, "${c.target_name}", PKD=${pkd}${meta}, algo=${c.match.algo_score}, reasons=[${c.match.reason_codes.slice(0, 3).join(',')}]`
  })

  return `PRODUKT:
${productLine}

KANDYDACI (po algo_score desc):
${lines.join('\n')}

Zwróć JSON z polem "rescored" zgodnie z instrukcją.`
}

export async function rescoreTop20(
  supabase: SupabaseClient,
  apiKey: string,
  productId: string,
): Promise<RescoreSummary> {
  const startedAt = Date.now()
  const summary: RescoreSummary = {
    product_id: productId,
    product_name: '',
    candidates_count: 0,
    rescored_count: 0,
    cost_usd: 0,
    duration_ms: 0,
    ai_score_min: 0,
    ai_score_max: 0,
  }

  if (!apiKey) {
    summary.error = 'ANTHROPIC_API_KEY missing'
    summary.duration_ms = Date.now() - startedAt
    return summary
  }

  // 1. Load product + family
  const { data: prodRow } = await supabase
    .from('products')
    .select('id, name, brand, family_id, gramatura, category')
    .eq('id', productId)
    .single()
  if (!prodRow) {
    summary.error = 'product not found'
    summary.duration_ms = Date.now() - startedAt
    return summary
  }
  const product = prodRow as ProductRow
  summary.product_name = product.name

  let family: FamilyRow | null = null
  if (product.family_id) {
    const { data: famRow } = await supabase
      .from('taxonomy_families')
      .select('id, name_pl')
      .eq('id', product.family_id)
      .single()
    if (famRow) family = famRow as FamilyRow
  }

  // 2. Top 20 matches
  const { data: matchRows } = await supabase
    .from('matches')
    .select('id, client_id, prospect_id, algo_score, reason_codes')
    .eq('product_id', productId)
    .order('algo_score', { ascending: false })
    .limit(MAX_CANDIDATES)
  const matches = (matchRows ?? []) as MatchRow[]
  summary.candidates_count = matches.length

  if (matches.length === 0) {
    summary.duration_ms = Date.now() - startedAt
    return summary
  }

  // 3. Enrich targets (one round-trip per source)
  const clientIds = matches.filter((m) => m.client_id).map((m) => m.client_id as string)
  const prospectIds = matches.filter((m) => m.prospect_id).map((m) => m.prospect_id as string)

  const [clientsRes, prospectsRes] = await Promise.all([
    clientIds.length > 0
      ? supabase
          .from('clients')
          .select('id, title, nip, region, vat_status, krs_legal_form, pkd_2007_codes')
          .in('id', clientIds)
      : Promise.resolve({ data: [] }),
    prospectIds.length > 0
      ? supabase
          .from('ceidg_prospects')
          .select('id, name, nip, miejscowosc, wojewodztwo, vat_status, pkd_main, pkd_all')
          .in('id', prospectIds)
      : Promise.resolve({ data: [] }),
  ])
  const clientMap = new Map<string, ClientLite>(
    ((clientsRes.data ?? []) as ClientLite[]).map((c) => [c.id, c]),
  )
  const prospectMap = new Map<string, ProspectLite>(
    ((prospectsRes.data ?? []) as ProspectLite[]).map((p) => [p.id, p]),
  )

  // 4. Build candidate payload
  const candidates = matches.map((m) => {
    if (m.client_id) {
      const c = clientMap.get(m.client_id)
      const meta: string[] = []
      if (c?.region) meta.push(c.region)
      if (c?.vat_status) meta.push(`VAT=${c.vat_status}`)
      if (c?.krs_legal_form) meta.push(c.krs_legal_form)
      return {
        match: m,
        target_type: 'client' as const,
        target_name: c?.title ?? '?',
        target_pkd: c?.pkd_2007_codes ?? [],
        target_meta: meta,
      }
    }
    const p = m.prospect_id ? prospectMap.get(m.prospect_id) : null
    const meta: string[] = []
    if (p?.miejscowosc) meta.push(p.miejscowosc)
    if (p?.wojewodztwo) meta.push(p.wojewodztwo)
    if (p?.vat_status) meta.push(`VAT=${p.vat_status}`)
    const pkdAll = new Set<string>()
    if (p?.pkd_main) pkdAll.add(p.pkd_main)
    if (p?.pkd_all) for (const c of p.pkd_all) if (c) pkdAll.add(c)
    return {
      match: m,
      target_type: 'prospect' as const,
      target_name: p?.name ?? '?',
      target_pkd: Array.from(pkdAll),
      target_meta: meta,
    }
  })

  // 5. Call Claude
  const userPrompt = buildUserPrompt(product, family, candidates)
  const ai = await callAI({
    apiKey,
    provider: 'anthropic',
    model: AI_MODELS.FAST,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 3000, // Sprint G smoke: 2000 was sometimes hit на 20 candidates
    temperature: 0.2,
  })

  if (ai.error || !ai.text) {
    summary.error = ai.error ?? 'empty AI response'
    summary.duration_ms = Date.now() - startedAt
    return summary
  }

  // 6. Parse JSON
  let parsed: { rescored?: Array<{ id: string; ai_score: number; reasoning: string; confidence: number }> }
  try {
    parsed = extractJSON<typeof parsed>(ai.text)
  } catch (err) {
    summary.error = `parse failed: ${err instanceof Error ? err.message : String(err)}`
    summary.duration_ms = Date.now() - startedAt
    return summary
  }

  const rescored = parsed.rescored ?? []
  if (!Array.isArray(rescored) || rescored.length === 0) {
    summary.error = 'AI returned empty rescored array'
    summary.duration_ms = Date.now() - startedAt
    return summary
  }

  // 7. UPDATE rows
  const now = new Date().toISOString()
  const validIds = new Set(matches.map((m) => m.id))
  let scored = 0
  const scores: number[] = []
  for (const r of rescored) {
    if (!validIds.has(r.id)) continue
    const aiScore = Math.min(Math.max(Math.round(r.ai_score), 0), 100)
    const aiConfidence = Math.min(Math.max(r.confidence, 0), 1)
    const aiReasoning = (r.reasoning ?? '').slice(0, 300)
    const { error } = await supabase
      .from('matches')
      .update({
        ai_score: aiScore,
        ai_reasoning: aiReasoning,
        ai_confidence: aiConfidence,
        ai_scored_at: now,
      })
      .eq('id', r.id)
    if (!error) {
      scored++
      scores.push(aiScore)
    }
  }
  summary.rescored_count = scored
  summary.ai_score_min = scores.length > 0 ? Math.min(...scores) : 0
  summary.ai_score_max = scores.length > 0 ? Math.max(...scores) : 0

  // Cost estimation: ai-providers.ts logs precise cost ale ми не маємо
  // direct access на usage. Approx: ~1500 in + ~1500 out tokens.
  const tokensApprox = ai.tokensUsed ?? 3000
  // Approx 50/50 in/out split — actual log will be exact in [CLAUDE] line
  const estCost = (tokensApprox * 0.5 * HAIKU_INPUT_PER_M + tokensApprox * 0.5 * HAIKU_OUTPUT_PER_M) / 1_000_000
  summary.cost_usd = Math.round(estCost * 10000) / 10000

  summary.duration_ms = Date.now() - startedAt
  return summary
}

/** Bulk rescore — iterates всі products з family_id. Cost guard: ABORT
 *  якщо total estimated cost exceeds MAX_BULK_COST_USD. */
export async function rescoreAllProducts(
  supabase: SupabaseClient,
  apiKey: string,
): Promise<{
  summaries: RescoreSummary[]
  total_cost_usd: number
  total_duration_ms: number
  aborted: boolean
}> {
  const startedAt = Date.now()
  const { data: prodRows } = await supabase
    .from('products')
    .select('id, name')
    .not('family_id', 'is', null)
  const products = (prodRows ?? []) as Array<{ id: string; name: string }>

  const summaries: RescoreSummary[] = []
  let totalCost = 0
  let aborted = false

  for (const p of products) {
    if (totalCost > MAX_BULK_COST_USD) {
      aborted = true
      console.warn(`[AI_RESCORE_BULK] Cost guard hit ($${totalCost.toFixed(2)} > $${MAX_BULK_COST_USD}) — aborting`)
      break
    }
    const s = await rescoreTop20(supabase, apiKey, p.id)
    summaries.push(s)
    totalCost += s.cost_usd
  }

  return {
    summaries,
    total_cost_usd: Math.round(totalCost * 10000) / 10000,
    total_duration_ms: Date.now() - startedAt,
    aborted,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sprint S6A Step 2 — Per-CLIENT AI rescore (TOP-10 products for ONE client)
// ─────────────────────────────────────────────────────────────────────────
//
// Inverse perspective vs rescoreTop20: there it's 1 product × N candidates,
// here it's 1 client × N products. AI sees full client business_profile
// (Phase B output) + product details + algo_score + reason_codes.
//
// Triggered as STEP 7 у Phase B pipeline (lookup/route.ts) — final layer
// Protocol 13: AI re-score з ПОВНИМ contextom з усіх sources, last step
// перш ніж Phase B завершується.
//
// Cost: ~$0.005-0.01 per call (Haiku 4.5, ~1500 in + ~800 out tokens).
// Per-client < per-product because we have 10 candidates not 20.

interface MatchRowForClient {
  id: string
  product_id: string
  algo_score: number
  reason_codes: string[]
}

interface ClientForRescore {
  id: string
  title: string
  nip: string | null
  region: string | null
  vat_status: string | null
  krs_legal_form: string | null
  pkd_2007_codes: string[] | null
  pkd_2025_codes: string[] | null
  business_profile: {
    business_format?: string
    estimated_locations?: number | null
    product_categories_pl?: string[]
    target_demographics_pl?: string[]
    special_traits_pl?: string[]
    business_summary_pl?: string
    buyer_strength_for_chm?: number
    buyer_reasoning_pl?: string
  } | null
}

interface ProductForRescore {
  id: string
  name: string
  brand: string | null
  family_id: string | null
  gramatura: string | null
  category: string | null
}

const MAX_CLIENT_CANDIDATES = 10

const CLIENT_RESCORE_SYSTEM_PROMPT = `Jesteś analitykiem sprzedaży B2B HoReCa w Polsce. Otrzymujesz JEDNEGO klienta i listę kandydatów-produktów. Twoja praca: ocenić realistyczne prawdopodobieństwo, że TEN klient kupi KAŻDY z produktów.

KONTEKST:
- Klient ma własny profil biznesowy (format, kategorie, demografia, traits, summary). Wykorzystaj wszystkie te sygnały.
- Algorytmiczny pre-score (algo_score) bazuje na PKD-fit + status VAT/GUS + niche bonus z business_profile. Twoje zadanie: doprecyzować ten sygnał, nie powtarzać go.
- AI ma finalny kontekst (po wszystkich źródłach Phase B), więc ocena ma być pełna.
- Klient może być JDG, sp. z o.o. lub S.A. — analizuj realnie wg formatu działalności.

ZASADY OCENY:
- Wysoki score (70-100) — produkt pasuje do business_format / kategorii / demografii klienta (np. restauracja kupuje sałatki gotowe; sklep spożywczy kupuje kiszonki; catering kupuje buraki).
- Średni score (40-69) — produkt adjacent, możliwy ad-hoc zakup ale nie core asortyment.
- Niski score (0-39) — produkt nie pasuje (np. transport, usługi medyczne, manufacturing nie-spożywczy).
- VAT czynny + GUS active = +5 do bazowej oceny (operuje aktywnie).
- Brak business_profile signal — neutralny, polegaj na PKD + algo_score.

OUTPUT: czysty JSON, bez preambuły, bez markdown. Format ŚCIŚLE:
{"rescored": [{"id": "<match_id>", "ai_score": <0-100>, "reasoning": "<1 zdanie PL, max 120 znaków>", "confidence": <0.0-1.0>}, ...]}

Jeden obiekt per produkt-kandydat, w tej samej kolejności co input. confidence: 0.9+ dla jasnych match/no-match, 0.5-0.7 dla ambiguous.`

function buildClientUserPrompt(
  client: ClientForRescore,
  candidates: Array<{
    match: MatchRowForClient
    product: ProductForRescore
    family_name: string | null
  }>,
): string {
  const profile = client.business_profile
  const meta: string[] = []
  if (client.region) meta.push(client.region)
  if (client.vat_status) meta.push(`VAT=${client.vat_status}`)
  if (client.krs_legal_form) meta.push(client.krs_legal_form)

  const pkdCodes = client.pkd_2007_codes ?? client.pkd_2025_codes ?? []
  const pkdStr = pkdCodes.length > 0 ? pkdCodes.slice(0, 6).join(',') : '-'

  const profileLines: string[] = []
  if (profile) {
    if (profile.business_format) profileLines.push(`format=${profile.business_format}`)
    if (profile.estimated_locations) profileLines.push(`lokalizacje=${profile.estimated_locations}`)
    if (profile.product_categories_pl?.length)
      profileLines.push(`kategorie=[${profile.product_categories_pl.slice(0, 5).join(',')}]`)
    if (profile.target_demographics_pl?.length)
      profileLines.push(`demografia=[${profile.target_demographics_pl.slice(0, 3).join(',')}]`)
    if (profile.special_traits_pl?.length)
      profileLines.push(`traits=[${profile.special_traits_pl.slice(0, 3).join(',')}]`)
    if (typeof profile.buyer_strength_for_chm === 'number')
      profileLines.push(`buyer_strength=${profile.buyer_strength_for_chm}`)
    if (profile.business_summary_pl)
      profileLines.push(`summary="${profile.business_summary_pl.slice(0, 200)}"`)
  }

  const lines = candidates.map((c, i) => {
    const familyName = c.family_name ?? '?'
    const productLine = `${c.product.name}${c.product.gramatura ? ` (${c.product.gramatura})` : ''}, marka=${c.product.brand ?? '?'}, Family="${familyName}"${c.product.category ? `, kat=${c.product.category}` : ''}`
    return `[${i + 1}] id="${c.match.id}", "${productLine}", algo=${c.match.algo_score}, reasons=[${c.match.reason_codes.slice(0, 3).join(',')}]`
  })

  return `KLIENT:
"${client.title}", NIP=${client.nip ?? '-'}${meta.length > 0 ? `, ${meta.join(', ')}` : ''}
PKD: ${pkdStr}
${profileLines.length > 0 ? `Profil biznesowy:\n${profileLines.map((l) => '- ' + l).join('\n')}` : 'Profil biznesowy: brak (business_profile=null)'}

KANDYDACI-PRODUKTY (po algo_score desc):
${lines.join('\n')}

Zwróć JSON z polem "rescored" zgodnie z instrukcją.`
}

/** Per-client AI rescore — TOP-10 products dla danego klienta. Mirror
 *  rescoreTop20 pattern ale inverted perspective. Triggered у Phase B
 *  лук-up pipeline як final Protocol 13 step (AI з повним contextom). */
export async function rescoreClientTop10(
  supabase: SupabaseClient,
  apiKey: string,
  clientId: string,
): Promise<{ ok: boolean; rescored: number; cost_usd: number; error?: string }> {
  // 0. Cost guards — graceful skip (ok:true so caller doesn't surface error)
  if (!apiKey) {
    return { ok: true, rescored: 0, cost_usd: 0 }
  }

  // 1. Load client + business_profile
  const { data: clientRow } = await supabase
    .from('clients')
    .select(
      'id, title, nip, region, vat_status, krs_legal_form, pkd_2007_codes, pkd_2025_codes, business_profile',
    )
    .eq('id', clientId)
    .single()
  if (!clientRow) {
    return { ok: true, rescored: 0, cost_usd: 0, error: 'client not found' }
  }
  const client = clientRow as ClientForRescore
  if (!client.business_profile) {
    // Graceful skip — AI має нulоwy context, не варто витрачати tokens
    return { ok: true, rescored: 0, cost_usd: 0 }
  }

  // 2. TOP-10 matches WHERE client_id=clientId
  const { data: matchRows } = await supabase
    .from('matches')
    .select('id, product_id, algo_score, reason_codes')
    .eq('client_id', clientId)
    .order('algo_score', { ascending: false })
    .limit(MAX_CLIENT_CANDIDATES)
  const matches = (matchRows ?? []) as MatchRowForClient[]
  if (matches.length === 0) {
    return { ok: true, rescored: 0, cost_usd: 0 }
  }

  // 3. JOIN з products (one round-trip)
  const productIds = matches.map((m) => m.product_id)
  const { data: prodRows } = await supabase
    .from('products')
    .select('id, name, brand, family_id, gramatura, category')
    .in('id', productIds)
  const productMap = new Map<string, ProductForRescore>(
    ((prodRows ?? []) as ProductForRescore[]).map((p) => [p.id, p]),
  )

  // 4. Resolve family names (one query)
  const familyIds = Array.from(
    new Set(
      ((prodRows ?? []) as ProductForRescore[])
        .map((p) => p.family_id)
        .filter((id): id is string => id !== null && id !== undefined),
    ),
  )
  const familyMap = new Map<string, string>()
  if (familyIds.length > 0) {
    const { data: famRows } = await supabase
      .from('taxonomy_families')
      .select('id, name_pl')
      .in('id', familyIds)
    for (const f of (famRows ?? []) as Array<{ id: string; name_pl: string }>) {
      familyMap.set(f.id, f.name_pl)
    }
  }

  // 5. Build candidate payload (skip matches з missing product row)
  const candidates = matches
    .map((m) => {
      const product = productMap.get(m.product_id)
      if (!product) return null
      const family_name = product.family_id ? familyMap.get(product.family_id) ?? null : null
      return { match: m, product, family_name }
    })
    .filter(
      (c): c is { match: MatchRowForClient; product: ProductForRescore; family_name: string | null } =>
        c !== null,
    )

  if (candidates.length === 0) {
    return { ok: true, rescored: 0, cost_usd: 0 }
  }

  // 6. Single Claude Haiku call
  const userPrompt = buildClientUserPrompt(client, candidates)
  const ai = await callAI({
    apiKey,
    provider: 'anthropic',
    model: AI_MODELS.FAST,
    systemPrompt: CLIENT_RESCORE_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2000,
    temperature: 0.2,
  })

  if (ai.error || !ai.text) {
    return { ok: false, rescored: 0, cost_usd: 0, error: ai.error ?? 'empty AI response' }
  }

  // 7. Parse JSON via shared extractJSON helper
  let parsed: { rescored?: Array<{ id: string; ai_score: number; reasoning: string; confidence: number }> }
  try {
    parsed = extractJSON<typeof parsed>(ai.text)
  } catch (err) {
    return {
      ok: false,
      rescored: 0,
      cost_usd: 0,
      error: `parse failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const rescored = parsed.rescored ?? []
  if (!Array.isArray(rescored) || rescored.length === 0) {
    return { ok: false, rescored: 0, cost_usd: 0, error: 'AI returned empty rescored array' }
  }

  // 8. UPDATE matches rows
  const now = new Date().toISOString()
  const validIds = new Set(matches.map((m) => m.id))
  let scored = 0
  for (const r of rescored) {
    if (!validIds.has(r.id)) continue
    const aiScore = Math.min(Math.max(Math.round(r.ai_score), 0), 100)
    const aiConfidence = Math.min(Math.max(r.confidence, 0), 1)
    const aiReasoning = (r.reasoning ?? '').slice(0, 300)
    const { error } = await supabase
      .from('matches')
      .update({
        ai_score: aiScore,
        ai_reasoning: aiReasoning,
        ai_confidence: aiConfidence,
        ai_scored_at: now,
      })
      .eq('id', r.id)
    if (!error) scored++
  }

  // 9. Cost estimation (mirror rescoreTop20 approx)
  const tokensApprox = ai.tokensUsed ?? 2000
  const estCost =
    (tokensApprox * 0.5 * HAIKU_INPUT_PER_M + tokensApprox * 0.5 * HAIKU_OUTPUT_PER_M) / 1_000_000
  const costUsd = Math.round(estCost * 10000) / 10000

  return { ok: true, rescored: scored, cost_usd: costUsd }
}
