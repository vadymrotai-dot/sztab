// lib/ai/business-analysis.ts
// Sprint L Phase 3 — AI business analysis (Claude Haiku 4.5).
//
// Input: всі accumulated enrichment data на client (KRS / GUS / CEIDG /
// VAT / BZP / financials / persons / Tavily / Apify GMaps / website crawl).
// Output: structured business_profile JSONB describing model + buyer
// strength для ChM Czudowa Marka portfolio.

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAI, AI_MODELS, extractJSON } from '@/lib/ai-providers'

export interface BusinessProfile {
  business_format:
    | 'single_store'
    | 'chain'
    | 'franchise'
    | 'online'
    | 'B2B_distributor'
    | 'gastronomy'
    | 'manufacturer'
    | 'service'
    | 'other'
  estimated_locations: number | null
  product_categories_pl: string[]
  target_demographics_pl: string[]
  special_traits_pl: string[]
  business_summary_pl: string
  buyer_strength_for_chm: number
  buyer_reasoning_pl: string
  model_used: string
  analyzed_at: string
  input_sources: string[]
}

const SYSTEM_PROMPT = `Jesteś analitykiem biznesowym B2B w Polsce. Otrzymujesz zebrane z otwartych źródeł dane o firmie. Twoje zadanie: opisać JEJ MODEL BIZNESOWY i ZACHOWANIE KUPIECKIE.

Skupiaj się na:
- Czy to pojedyncza placówka, sieć, hurtownia, gastronomia, online sklep
- Ile lokalizacji ma (szacunek z Google Maps + WWW jeśli "Sklepy"/"Lokalizacje" page)
- Jakie kategorie produktów sprzedaje/kupuje
- Kto target audience: diaspora ukraińska/polska/turyści/B2B/inni
- Specjalne cechy: regionalność, etniczność, segment cenowy, certyfikaty

KONTEKST DLA buyer_strength_for_chm:
ChM Czudowa Marka — polski producent KISZONEK (kapusta, ogórki, buraki),
GOTOWANYCH WARZYW i SAŁATEK (sterylizowanych, w słoikach). Tradycyjne
polskie smaki, surowiec krajowy, segment mid-market.

Wysokie buyer_strength_for_chm (80-95) — jeśli firma:
- prowadzi gastronomię z polską/wschodnioeuropejską kuchnią
- sieć sklepów ukraińskich/wschodnioeuropejskich (warzywa konserwowane to
  ważna kategoria w kuchni ukraińskiej, polskiej, słowiańskiej)
- DPS / catering dla instytucji publicznych z BZP win na warzywach
- restauracja z menu polsko-ukraińskim/regionalnym

Średnie (50-75) — generyczna gastronomia/sklep spożywczy bez specjalizacji.

Niskie (10-40) — branża nie food, nieadekwatne PKD, online-only sklep z
nieadekwatnym asortymentem.

🔥 SPECJALIZACJA Z PKD GŁÓWNEGO (Sprint S6C):
Jeśli PKD główny chronię specyficzną kategorię produktową (RYBY/SKORUPIAKI,
MIĘSO, ALKOHOL, NAPOJE, MLEKO, NABIAŁ, ZBOŻA, PIECZYWO, OWOCE/WARZYWA,
HISZPAŃSKIE/WŁOSKIE/ETNICZNE produkty, etc.) — to JEST SPECJALIZACJA firmy.
- W special_traits_pl MUSI znaleźć się "Specjalizacja: {kategoria}"
  (np. "Specjalizacja: ryby i owoce morza")
- W business_summary_pl mention specialization explicit
- NIE pisać "uniwersalny bez specjalizacji" gdy główny PKD = specifik kategoria
- Generic PKDs typu "sprzedaż detaliczna pozostałych" → traktuj jako uniwersalny

OUTPUT: czysty JSON, bez preambuły, bez markdown. Dokładnie ten shape:
{
  "business_format": "...",
  "estimated_locations": <number или null>,
  "product_categories_pl": [...],
  "target_demographics_pl": [...],
  "special_traits_pl": [...],
  "business_summary_pl": "<2-3 zdania>",
  "buyer_strength_for_chm": <0-100>,
  "buyer_reasoning_pl": "<1-2 zdania>"
}`

interface CompanyContext {
  nazwa: string
  nip: string
  forma: string | null
  krs: string | null
  registered_date: string | null
  pkd_codes: string[]
  pkd_main: string | null
  /** Sprint S6C STEP 2 (11.05.2026) — PKD з опискою для specialization
   *  detection. Source: clients.krs_pkd_with_descriptions JSONB (migration 021).
   *  Fallback: empty array — prompt uses pkd_codes only. */
  pkd_with_descriptions: Array<{ kod: string; opis: string | null; isMain: boolean }>
  city: string | null
  vat_status: string | null
  zarząd: Array<{ imie: string; nazwisko: string; rola: string }>
  financials: Array<{ rok: number; przychody_pln: number | null; zysk_netto_pln: number | null }>
  bzp_tenders: Array<{ subject: string; cpv: string[]; date: string | null }>
  website_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  google_maps_count: number
  news_mentions: Array<{ title: string; snippet: string }>
  apify_data: {
    rating: number | null
    reviews_count: number | null
    categories: string | null
    address: string | null
  } | null
}

async function gatherContext(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{ context: CompanyContext; inputSources: string[] }> {
  const inputSources: Set<string> = new Set()

  // Sprint S6C STEP 2 — додано krs_pkd_with_descriptions для specialization
  // detection у AI prompt.
  const { data: client } = await supabase
    .from('clients')
    .select('title, nip, krs_legal_form, krs_number, registered_date, city, vat_status, krs_management_board, krs_pkd_with_descriptions')
    .eq('id', clientId)
    .single()
  const c = (client ?? {}) as {
    title?: string
    nip?: string
    krs_legal_form?: string | null
    krs_number?: string | null
    registered_date?: string | null
    city?: string | null
    vat_status?: string | null
    krs_management_board?: Array<{ name?: string; surname?: string; functionName?: string; funkcjaWOrganie?: string }> | null
    krs_pkd_with_descriptions?: Array<{ kod: string; opis: string | null; isMain: boolean }> | null
  }

  // Profile fields для PKD codes / website
  const { data: fields } = await supabase
    .from('company_profile_fields')
    .select('field_key, value_text, value_json, source')
    .eq('client_id', clientId)
    .is('superseded_at', null)
  const fieldMap = new Map<string, { value_text: string | null; value_json: unknown; source: string }>()
  for (const f of (fields ?? []) as Array<{ field_key: string; value_text: string | null; value_json: unknown; source: string }>) {
    fieldMap.set(f.field_key, f)
    inputSources.add(f.source)
  }

  // Persons (zarząd)
  const { data: pcl } = await supabase
    .from('person_company_links')
    .select('rola, person:persons(imie, nazwisko)')
    .eq('client_id', clientId)
    .is('data_do', null)
  // Supabase joined relations comes through як array; tighten through unknown.
  const pclRows = ((pcl ?? []) as unknown) as Array<{
    rola: string
    person: { imie: string; nazwisko: string } | { imie: string; nazwisko: string }[] | null
  }>
  const zarząd = pclRows
    .map((l) => {
      const p = Array.isArray(l.person) ? l.person[0] : l.person
      return p ? { imie: p.imie, nazwisko: p.nazwisko, rola: l.rola } : null
    })
    .filter((x): x is { imie: string; nazwisko: string; rola: string } => x !== null)
  if (zarząd.length > 0) inputSources.add('persons')

  // Financials
  const { data: fin } = await supabase
    .from('company_financials')
    .select('rok, przychody_pln, zysk_netto_pln')
    .eq('client_id', clientId)
    .order('rok', { ascending: false })
    .limit(3)
  const financials = (fin ?? []) as Array<{ rok: number; przychody_pln: number | null; zysk_netto_pln: number | null }>
  if (financials.length > 0) inputSources.add('sprawozdania_KRS')

  // BZP
  const { data: bzp } = await supabase
    .from('bzp_tenders')
    .select('subject, cpv_codes, award_date')
    .eq('client_id', clientId)
    .order('award_date', { ascending: false, nullsFirst: false })
    .limit(5)
  const bzpTenders = ((bzp ?? []) as Array<{ subject: string | null; cpv_codes: string[]; award_date: string | null }>).map((b) => ({
    subject: b.subject ?? '',
    cpv: b.cpv_codes,
    date: b.award_date,
  }))
  if (bzpTenders.length > 0) inputSources.add('BZP')

  // Apify GMaps
  const { data: ce } = await supabase
    .from('contact_enrichment')
    .select('gmaps_rating, gmaps_reviews_count, raw_payload')
    .eq('target_type', 'client')
    .eq('target_id', clientId)
    .eq('status', 'success')
    .order('enriched_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const apify = ce
    ? {
        rating: (ce as { gmaps_rating: number | null }).gmaps_rating,
        reviews_count: (ce as { gmaps_reviews_count: number | null }).gmaps_reviews_count,
        categories: (
          ((ce as { raw_payload: { best?: { categoryName?: string } } | null }).raw_payload?.best?.categoryName) ??
          null
        ),
        address: (
          ((ce as { raw_payload: { best?: { address?: string } } | null }).raw_payload?.best?.address) ??
          null
        ),
      }
    : null
  if (apify) inputSources.add('Apify_GMaps')

  // Tavily news
  const newsField = fieldMap.get('news_mentions')
  const news = newsField && Array.isArray(newsField.value_json)
    ? (newsField.value_json as Array<{ title: string; snippet: string }>).slice(0, 5)
    : []
  if (news.length > 0) inputSources.add('tavily')

  // Website / FB / IG
  if (fieldMap.has('website')) inputSources.add('tavily')
  if (c.krs_number) inputSources.add('KRS')
  if (c.vat_status) inputSources.add('VAT_BL')
  inputSources.add('GUS') // most clients have GUS

  // PKD codes (use canonical or array of strings from value_json)
  const pkdField = fieldMap.get('pkd_codes')
  const pkdCodes = pkdField && Array.isArray(pkdField.value_json)
    ? (pkdField.value_json as string[])
    : []
  const pkdMain = (fieldMap.get('pkd_main')?.value_text as string | null) ?? null

  const gmapsField = fieldMap.get('google_maps_urls')
  const gmapsCount = gmapsField && Array.isArray(gmapsField.value_json)
    ? (gmapsField.value_json as unknown[]).length
    : 0

  const context: CompanyContext = {
    nazwa: c.title ?? '?',
    nip: c.nip ?? '?',
    forma: c.krs_legal_form ?? null,
    krs: c.krs_number ?? null,
    registered_date: c.registered_date ?? null,
    pkd_codes: pkdCodes,
    pkd_main: pkdMain,
    pkd_with_descriptions: Array.isArray(c.krs_pkd_with_descriptions)
      ? c.krs_pkd_with_descriptions
      : [],
    city: c.city ?? null,
    vat_status: c.vat_status ?? null,
    zarząd,
    financials,
    bzp_tenders: bzpTenders,
    website_url: (fieldMap.get('website')?.value_text as string | null) ?? null,
    facebook_url: (fieldMap.get('facebook_url')?.value_text as string | null) ?? null,
    instagram_url: (fieldMap.get('instagram_url')?.value_text as string | null) ?? null,
    google_maps_count: gmapsCount,
    news_mentions: news,
    apify_data: apify,
  }

  return { context, inputSources: Array.from(inputSources) }
}

function buildUserPrompt(ctx: CompanyContext): string {
  const lines: string[] = []
  lines.push(`DANE FIRMY:\n`)
  lines.push(`Identyfikacja:`)
  lines.push(`- Nazwa: ${ctx.nazwa}`)
  lines.push(`- NIP: ${ctx.nip}`)
  lines.push(`- Forma prawna: ${ctx.forma ?? 'nieznana'}`)
  if (ctx.krs) lines.push(`- KRS: ${ctx.krs}`)
  if (ctx.registered_date) lines.push(`- Data rejestracji: ${ctx.registered_date}`)
  if (ctx.vat_status) lines.push(`- VAT: ${ctx.vat_status}`)
  if (ctx.city) lines.push(`- Miasto: ${ctx.city}`)
  lines.push('')

  // Sprint S6C STEP 2 — PKD з опискою для specialization detection.
  // Якщо krs_pkd_with_descriptions populated (rejestrio sync) — render
  // detailed list. Fallback: codes only.
  if (ctx.pkd_with_descriptions.length > 0) {
    lines.push(`KODY PKD (działalność gospodarcza):`)
    // Main first, then 9 більше
    const sorted = [...ctx.pkd_with_descriptions].sort(
      (a, b) => (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0),
    )
    for (const p of sorted.slice(0, 10)) {
      const marker = p.isMain ? ' (GŁÓWNE)' : ''
      lines.push(`- ${p.kod}: ${p.opis ?? '(brak opisu)'}${marker}`)
    }
    lines.push('')
  } else if (ctx.pkd_codes.length > 0) {
    lines.push(
      `PKD: ${ctx.pkd_codes.slice(0, 10).join(', ')}${ctx.pkd_main ? ` (główne: ${ctx.pkd_main})` : ''}`,
    )
    lines.push('')
  }

  if (ctx.zarząd.length > 0) {
    lines.push(`Zarząd / decyzyjni:`)
    for (const z of ctx.zarząd.slice(0, 8)) lines.push(`- ${z.imie} ${z.nazwisko} (${z.rola})`)
    lines.push('')
  }

  if (ctx.financials.length > 0) {
    lines.push(`Sprawozdania finansowe (last 3 years):`)
    for (const f of ctx.financials) {
      lines.push(`- ${f.rok}: przychody ${f.przychody_pln ?? '?'} PLN, zysk netto ${f.zysk_netto_pln ?? '?'} PLN`)
    }
    lines.push('')
  }

  if (ctx.bzp_tenders.length > 0) {
    lines.push(`BZP — ostatnie tendery:`)
    for (const b of ctx.bzp_tenders) {
      lines.push(`- "${b.subject.slice(0, 80)}" CPV: ${b.cpv.slice(0, 3).join(',')}`)
    }
    lines.push('')
  }

  lines.push(`Online presence:`)
  lines.push(`- Website: ${ctx.website_url ?? '—'}`)
  lines.push(`- Facebook: ${ctx.facebook_url ?? '—'}`)
  lines.push(`- Instagram: ${ctx.instagram_url ?? '—'}`)
  lines.push(`- Google Maps locations found: ${ctx.google_maps_count}`)
  if (ctx.apify_data) {
    lines.push(`- Apify GMaps detail: rating ${ctx.apify_data.rating ?? '—'} (${ctx.apify_data.reviews_count ?? '?'} reviews)`)
    if (ctx.apify_data.categories) lines.push(`  categories: ${ctx.apify_data.categories}`)
    if (ctx.apify_data.address) lines.push(`  address: ${ctx.apify_data.address}`)
  }
  lines.push('')

  if (ctx.news_mentions.length > 0) {
    lines.push(`Wzmianki w sieci:`)
    for (const n of ctx.news_mentions) {
      lines.push(`- "${n.title.slice(0, 80)}" — ${n.snippet.slice(0, 200)}`)
    }
    lines.push('')
  }

  lines.push(`ZADANIE: Zwróć analizę biznesową jako JSON shape opisany w instrukcji systemowej.`)
  return lines.join('\n')
}

export async function analyzeBusinessProfile(
  supabase: SupabaseClient,
  apiKey: string,
  clientId: string,
): Promise<{ profile: BusinessProfile | null; cost_usd: number; error?: string }> {
  if (!apiKey) {
    return { profile: null, cost_usd: 0, error: 'ANTHROPIC_API_KEY missing' }
  }
  const { context, inputSources } = await gatherContext(supabase, clientId)
  const userPrompt = buildUserPrompt(context)

  const ai = await callAI({
    apiKey,
    provider: 'anthropic',
    model: AI_MODELS.FAST,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 1500,
    temperature: 0.3,
  })

  if (ai.error || !ai.text) {
    return { profile: null, cost_usd: 0, error: ai.error ?? 'empty AI response' }
  }

  let parsed: Partial<BusinessProfile>
  try {
    parsed = extractJSON<Partial<BusinessProfile>>(ai.text)
  } catch (err) {
    return { profile: null, cost_usd: 0, error: `parse: ${err instanceof Error ? err.message : err}` }
  }

  // Approximate cost (Haiku 4.5 ~$1 in / $5 out per 1M tokens)
  const tokens = ai.tokensUsed ?? 2500
  const cost = Math.round(((tokens * 0.5 * 1.0 + tokens * 0.5 * 5.0) / 1_000_000) * 10000) / 10000

  const profile: BusinessProfile = {
    business_format: (parsed.business_format ?? 'other') as BusinessProfile['business_format'],
    estimated_locations: parsed.estimated_locations ?? null,
    product_categories_pl: Array.isArray(parsed.product_categories_pl) ? parsed.product_categories_pl : [],
    target_demographics_pl: Array.isArray(parsed.target_demographics_pl) ? parsed.target_demographics_pl : [],
    special_traits_pl: Array.isArray(parsed.special_traits_pl) ? parsed.special_traits_pl : [],
    business_summary_pl: parsed.business_summary_pl ?? '',
    buyer_strength_for_chm: Math.max(0, Math.min(100, Math.round(parsed.buyer_strength_for_chm ?? 0))),
    buyer_reasoning_pl: parsed.buyer_reasoning_pl ?? '',
    model_used: 'claude-haiku-4-5',
    analyzed_at: new Date().toISOString(),
    input_sources: inputSources,
  }

  // Persist
  await supabase.from('clients').update({ business_profile: profile }).eq('id', clientId)

  return { profile, cost_usd: cost }
}
