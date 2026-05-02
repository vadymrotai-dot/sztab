// app/api/intelligence/lookup/route.ts
// Sprint K / Phase 3 — intelligence lookup orchestrator.
//
// POST { nip: '5252800123' } → 6-step sequential pipeline:
//   1. Identity sweep (CEIDG/KRS-via-GUS/GUS REGON) + create clients row
//   2. Status sweep (VAT Biała Lista)
//   3. Buying signals (BZP wins + sprawozdania finansowe + MSiG changes)
//   4. People extraction (KRS zarząd / CEIDG owner / website)
//   5. Online presence (Apify Google Maps)
//   6. Sztab match intelligence (computeMatchesForClient + AI rescore)
//
// Returns: { client_id, entity_type, sources_completed, fields_filled,
//            persons_created, top_matches, errors }

import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrichWithVAT, normalizeNip, isValidNip } from '@/lib/enrichment/vat'
import { enrichWithGUS, gusLogin } from '@/lib/enrichment/gus'
import { enrichWithKRS } from '@/lib/enrichment/krs'
import { searchBzpByWinnerNip } from '@/lib/enrichment/bzp'
import { fetchOrgBasic } from '@/lib/rejestrio/org-basic'
import { fetchRozdzialOgolny } from '@/lib/rejestrio/rozdzial-ogolny'
import { fetchRozdzialPrzeksztalcenia } from '@/lib/rejestrio/rozdzial-przeksztalcenia'
import { fetchRozdzialWzmianki } from '@/lib/rejestrio/rozdzial-wzmianki'
import { fetchRozdzialOddzialy } from '@/lib/rejestrio/rozdzial-oddzialy'
import { fetchAllFinancials } from '@/lib/rejestrio/sprawozdania'
import { fetchOsobaDetail } from '@/lib/rejestrio/persons'
import { fetchPersonNetwork } from '@/lib/rejestrio/person-network'
import { fetchCrbr } from '@/lib/rejestrio/crbr'
import { fetchBranches } from '@/lib/gus/branches'
import { extractFromWebsite } from '@/lib/enrichment/website'
import { upsertField, upsertFields } from '@/lib/profile/merge'
import { findExistingContact } from '@/lib/enrichment/contact-preflight'
import { enrichContactsApify } from '@/lib/enrichment/apify'
import { searchCompanyOnline } from '@/lib/enrichment/web-search'
import { analyzeBusinessProfile } from '@/lib/ai/business-analysis'
import { startEnrichmentRun, finishEnrichmentRun } from '@/lib/profile/enrichment-log'
import { computeMatchesForClient } from '@/lib/matching/engine'
import { rescoreClientTop10 } from '@/lib/matching/ai-rescore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface LookupRequest {
  nip?: string
}

interface StepResult {
  source: string
  status: 'success' | 'partial' | 'error' | 'skipped'
  fields_added?: number
  fields_updated?: number
  error?: string
  note?: string
}

interface LookupResponse {
  client_id: string | null
  entity_type: 'JDG' | 'sp.z o.o.' | 'S.A.' | 'inne' | 'unknown'
  sources_completed: StepResult[]
  fields_filled: number
  persons_created: number
  top_matches: Array<{ product_id: string; product_name: string; combined_score: number }>
  errors: string[]
  /** Sprint S5D — sources scheduled to run async w PHASE B (after()).
   *  Surfaces background work do UI (kompletny list aby zobaczyć co
   *  jeszcze przyjdzie, бeż misleading "X sources_completed" message
   *  gdy Tavily/Apify/AI runs trwają). */
  phase_b_pending?: string[]
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  let body: LookupRequest = {}
  try {
    body = (await req.json()) as LookupRequest
  } catch {
    return NextResponse.json({ ok: false, error: 'Niepoprawny JSON' }, { status: 400 })
  }
  const rawNip = body.nip ?? ''
  const nip = normalizeNip(rawNip)
  if (!isValidNip(nip)) {
    return NextResponse.json(
      { ok: false, error: `Niepoprawny NIP: ${rawNip}` },
      { status: 400 },
    )
  }

  // Read API keys з params
  const { data: paramsRow } = await supabase
    .from('params')
    .select('anthropic_api_key, gus_api_key, apify_api_token, krs_rejestr_api_token, tavily_api_key')
    .limit(1)
    .maybeSingle()
  const params = (paramsRow ?? {}) as {
    anthropic_api_key?: string
    gus_api_key?: string
    apify_api_token?: string
    krs_rejestr_api_token?: string
    tavily_api_key?: string
  }

  const response: LookupResponse = {
    client_id: null,
    entity_type: 'unknown',
    sources_completed: [],
    fields_filled: 0,
    persons_created: 0,
    top_matches: [],
    errors: [],
  }

  // ─── Find existing client by NIP ───
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id, owner_id')
    .eq('nip', nip)
    .maybeSingle()

  let clientId = (existingClient as { id: string } | null)?.id ?? null
  let ownerId =
    (existingClient as { owner_id: string } | null)?.owner_id ?? user.id

  // ─── STEP 1: Identity sweep (GUS first — enrichWithGUS extracts krs_number) ───
  let krsNumber: string | null = null
  let entityType: LookupResponse['entity_type'] = 'unknown'

  // 1a. GUS REGON
  if (params.gus_api_key) {
    const runId = await startEnrichmentRun(supabase, {
      target_type: 'company',
      target_id: clientId ?? '00000000-0000-0000-0000-000000000000',
      source: 'GUS',
    })
    try {
      const sessionId = await gusLogin(params.gus_api_key)
      const gus = await enrichWithGUS(sessionId, nip)
      // Extract KRS number з gus_data raw
      const reportData =
        (gus.raw as { report?: { root?: { dane?: Record<string, string> | Record<string, string>[] } } })
          ?.report?.root?.dane
      const reportFlat: Record<string, string | undefined> = Array.isArray(reportData)
        ? (reportData[0] ?? {})
        : ((reportData as Record<string, string | undefined>) ?? {})
      krsNumber =
        reportFlat.praw_numerWRejestrzeEwidencji ??
        reportFlat.praw_numerKRS ??
        reportFlat.praw_NumerNipWRejestrzeEwidencji ??
        null

      // Determine entity_type via REGON form symbol
      const formaPrawnaSymbol = reportFlat.praw_formaPrawnaNazwa ?? reportFlat.fiz_formaPrawnaNazwa
      if (formaPrawnaSymbol) {
        const lower = formaPrawnaSymbol.toLowerCase()
        if (lower.includes('akcyjna') || lower.includes('s.a.')) entityType = 'S.A.'
        else if (lower.includes('z o.o.') || lower.includes('z ograniczoną')) entityType = 'sp.z o.o.'
        else if (lower.includes('osoba fizyczna') || reportFlat.fiz_imie1) entityType = 'JDG'
        else entityType = 'inne'
      } else if (reportFlat.fiz_imie1) {
        entityType = 'JDG'
      }

      // Create clients row якщо немає
      if (!clientId) {
        const title = gus.legal_name ?? `Firma ${nip}`
        const { data: ins, error: insErr } = await supabase
          .from('clients')
          .insert({
            title,
            nip,
            status: 'aktywny',
            segment: 'niesklasyfikowany',
            owner_id: ownerId,
          })
          .select('id')
          .single()
        if (!insErr && ins) {
          clientId = (ins as { id: string }).id
          response.client_id = clientId
        }
      }

      // Upsert profile fields
      if (clientId) {
        const fieldsList: Array<{ field_key: string; value: { value_text?: string; value_number?: number; value_json?: unknown }; }> = []
        if (gus.legal_name) fieldsList.push({ field_key: 'legal_name', value: { value_text: gus.legal_name } })
        if (gus.regon) fieldsList.push({ field_key: 'regon', value: { value_text: gus.regon } })
        if (gus.status) fieldsList.push({ field_key: 'gus_status', value: { value_text: gus.status } })
        if (gus.registered_date) fieldsList.push({ field_key: 'registered_date', value: { value_text: gus.registered_date } })
        if (gus.employee_count_range) fieldsList.push({ field_key: 'employee_count_range', value: { value_text: gus.employee_count_range } })
        if (gus.pkd_codes && gus.pkd_codes.length > 0) fieldsList.push({ field_key: 'pkd_codes', value: { value_json: gus.pkd_codes } })
        if (krsNumber) fieldsList.push({ field_key: 'krs_number', value: { value_text: krsNumber } })

        const merged = await upsertFields(supabase, { type: 'client', id: clientId }, fieldsList, 'GUS')
        // Mirror GUS data back to clients table.
        // Sprint M FIX 2: GUS returns PKD-2007 codes — also write до
        // pkd_2007_codes (matching engine reads це через clientToTarget).
        // pkd_codes legacy column kept у sync. pkd_2025_codes left untouched
        // (separate future migration коли GUS adapts).
        await supabase
          .from('clients')
          .update({
            gus_data: gus.raw,
            gus_legal_name: gus.legal_name,
            gus_regon: gus.regon,
            gus_status: gus.status,
            registered_date: gus.registered_date,
            employee_count_range: gus.employee_count_range,
            pkd_codes: gus.pkd_codes,
            pkd_2007_codes: gus.pkd_codes && gus.pkd_codes.length > 0 ? gus.pkd_codes : null,
            gus_last_checked: gus.checked_at,
            krs_number: krsNumber,
          })
          .eq('id', clientId)

        response.fields_filled += merged.added.length + merged.updated.length
        response.sources_completed.push({
          source: 'GUS',
          status: 'success',
          fields_added: merged.added.length,
          fields_updated: merged.updated.length,
        })
        await finishEnrichmentRun(supabase, runId, {
          status: 'success',
          fields_added: merged.added,
          fields_updated: merged.updated,
          fields_unchanged: merged.unchanged,
          raw_payload: gus.raw,
        })

        // Sprint S1 Phase 4: extend з jednostki lokalne (GUS BIR ListaJednLokalnych)
        if (gus.regon) {
          try {
            const silosId = (gus.raw as { search?: { SilosID?: string } })?.search?.SilosID
            const branches = await fetchBranches(sessionId, gus.regon, silosId)
            if (branches.length > 0) {
              for (const b of branches) {
                if (!b.regon_jednostki) continue
                await supabase.from('company_branches').upsert(
                  {
                    client_id: clientId,
                    regon_jednostki: b.regon_jednostki,
                    nazwa: b.nazwa,
                    adres: b.adres,
                    data_rozpoczecia: b.data_rozpoczecia,
                    status: b.status,
                    source: 'gus_bir',
                  },
                  { onConflict: 'client_id,regon_jednostki' },
                )
              }
              await supabase
                .from('clients')
                .update({ branch_offices_count: branches.length })
                .eq('id', clientId)
            }
            response.sources_completed.push({
              source: 'GUS_branches',
              status: branches.length > 0 ? 'success' : 'partial',
              note: `${branches.length} jednostek lokalnych`,
            })
          } catch (brErr) {
            const brMsg = brErr instanceof Error ? brErr.message : String(brErr)
            response.sources_completed.push({ source: 'GUS_branches', status: 'error', error: brMsg })
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      response.errors.push(`GUS: ${msg}`)
      response.sources_completed.push({ source: 'GUS', status: 'error', error: msg })
      await finishEnrichmentRun(supabase, runId, { status: 'error', error_message: msg })
    }
  } else {
    response.sources_completed.push({ source: 'GUS', status: 'skipped', note: 'GUS_API_KEY missing' })
  }

  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: 'Failed to resolve clients row для NIP', response },
      { status: 502 },
    )
  }
  response.client_id = clientId
  response.entity_type = entityType

  // 1b. KRS lookup — Sprint M FIX 8: відкинуто entityType gating. KRS number
  // alone proves це legal entity (sp.z o.o./S.A./S.K.). GUS sometimes returns
  // null praw_formaPrawnaNazwa попри valid KRS — у тому випадку KRS step
  // sam determines legal_form. Раніше блок skipped → no krs_management_board
  // → no persons auto-created.
  if (krsNumber && entityType !== 'JDG') {
    const runId = await startEnrichmentRun(supabase, {
      target_type: 'company',
      target_id: clientId,
      source: 'KRS',
    })
    try {
      const krs = await enrichWithKRS(krsNumber)
      const fieldsList: Array<{ field_key: string; value: { value_text?: string; value_number?: number; value_json?: unknown } }> = []
      if (krs.full_name) fieldsList.push({ field_key: 'krs_full_name', value: { value_text: krs.full_name } })
      if (krs.legal_form) fieldsList.push({ field_key: 'legal_form', value: { value_text: krs.legal_form } })
      if (krs.registration_date) fieldsList.push({ field_key: 'krs_registration_date', value: { value_text: krs.registration_date } })
      if (krs.status) fieldsList.push({ field_key: 'krs_status', value: { value_text: krs.status } })
      if (krs.management_board && krs.management_board.length > 0)
        fieldsList.push({ field_key: 'krs_management_board', value: { value_json: krs.management_board } })
      if (krs.pkd_with_descriptions && krs.pkd_with_descriptions.length > 0)
        fieldsList.push({ field_key: 'krs_pkd_with_descriptions', value: { value_json: krs.pkd_with_descriptions } })
      if (krs.capital)
        fieldsList.push({ field_key: 'capital', value: { value_json: krs.capital } })

      const merged = await upsertFields(supabase, { type: 'client', id: clientId }, fieldsList, 'KRS')
      await supabase
        .from('clients')
        .update({
          krs_data: krs.raw,
          krs_full_name: krs.full_name,
          krs_legal_form: krs.legal_form,
          krs_registration_date: krs.registration_date,
          krs_status: krs.status,
          krs_management_board: krs.management_board,
          krs_pkd_with_descriptions: krs.pkd_with_descriptions,
          krs_last_checked: krs.checked_at,
        })
        .eq('id', clientId)
      response.fields_filled += merged.added.length + merged.updated.length
      response.sources_completed.push({
        source: 'KRS',
        status: 'success',
        fields_added: merged.added.length,
        fields_updated: merged.updated.length,
      })
      await finishEnrichmentRun(supabase, runId, {
        status: 'success',
        fields_added: merged.added,
        fields_updated: merged.updated,
        fields_unchanged: merged.unchanged,
        raw_payload: krs.raw,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      response.errors.push(`KRS: ${msg}`)
      response.sources_completed.push({ source: 'KRS', status: 'error', error: msg })
      await finishEnrichmentRun(supabase, runId, { status: 'error', error_message: msg })
    }
  }

  // ─── STEP 2: Status sweep (VAT) ───
  const vatRunId = await startEnrichmentRun(supabase, {
    target_type: 'company',
    target_id: clientId,
    source: 'VAT_BL',
  })
  try {
    const vat = await enrichWithVAT(nip)
    const fieldsList = []
    if (vat.status) fieldsList.push({ field_key: 'vat_status', value: { value_text: vat.status } })
    if (vat.registered_date)
      fieldsList.push({ field_key: 'vat_registered_date', value: { value_text: vat.registered_date } })
    if (vat.bank_accounts && vat.bank_accounts.length > 0)
      fieldsList.push({ field_key: 'bank_accounts', value: { value_json: vat.bank_accounts } })
    const merged = await upsertFields(supabase, { type: 'client', id: clientId }, fieldsList, 'VAT_BL')
    await supabase
      .from('clients')
      .update({
        vat_data: vat.raw,
        vat_status: vat.status,
        vat_registered_date: vat.registered_date,
        vat_bank_accounts: vat.bank_accounts,
        vat_last_checked: vat.checked_at,
      })
      .eq('id', clientId)
    response.fields_filled += merged.added.length + merged.updated.length
    response.sources_completed.push({ source: 'VAT_BL', status: 'success', fields_added: merged.added.length, fields_updated: merged.updated.length })
    await finishEnrichmentRun(supabase, vatRunId, {
      status: 'success',
      fields_added: merged.added,
      fields_updated: merged.updated,
      fields_unchanged: merged.unchanged,
      raw_payload: vat.raw,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    response.errors.push(`VAT: ${msg}`)
    response.sources_completed.push({ source: 'VAT_BL', status: 'error', error: msg })
    await finishEnrichmentRun(supabase, vatRunId, { status: 'error', error_message: msg })
  }

  // ═══ PHASE A complete: identity + VAT + initial matching ═══
  // Compute initial matches NOW (using GUS PKD codes) so /clients/[id]
  // shows useful data immediately. Final recompute після PHASE B (з AI
  // business_profile) overrides з niche bonus.
  try {
    const r = await computeMatchesForClient(supabase, clientId)
    if (r.ok) {
      const { data: topMatches } = await supabase
        .from('matches')
        .select('product_id, combined_score')
        .eq('client_id', clientId)
        .order('combined_score', { ascending: false })
        .limit(3)
      if (topMatches && topMatches.length > 0) {
        const productIds = (topMatches as Array<{ product_id: string; combined_score: number }>).map(
          (m) => m.product_id,
        )
        const { data: prods } = await supabase
          .from('products')
          .select('id, name')
          .in('id', productIds)
        const productMap = new Map<string, string>(
          ((prods ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]),
        )
        response.top_matches = (topMatches as Array<{ product_id: string; combined_score: number }>).map((m) => ({
          product_id: m.product_id,
          product_name: productMap.get(m.product_id) ?? '?',
          combined_score: m.combined_score,
        }))
      }
      response.sources_completed.push({ source: 'matching', status: 'success' })
    }
  } catch {
    /* match recompute failure non-fatal — PHASE B will retry */
  }

  // ─── PHASE B: schedule async enrichment via after() ───
  // Sprint M FIX 3 — split orchestrator щоб PHASE A returns < 30s
  // (avoids Vercel 504). PHASE B runs після response sent, до 120s
  // function ceiling. UI on /clients/[id] poll enrichment_log дla running
  // sources і refreshes coли всi complete.
  // Capture закаптурити dependencies bo після response request scope може
  // бути invalidated; clientId та entityType passed by value.
  const phaseB_clientId = clientId
  const phaseB_nip = nip
  const phaseB_entityType = entityType
  const phaseB_krsNumber = krsNumber
  const phaseB_params = params

  // Sprint S5D — surface conditional Phase B sources do response.
  // Replicate tavily key resolution з runPhaseB line ~512 (params first,
  // env fallback) tak żeby pending list było honest (nie pokażmy tavily
  // gdy brak klucza). Apify pre-flight (existing-contact check) decyduje
  // wewnątrz runPhaseB — tu pokazujemy "może run" gdy klucz present.
  const tavilyWillRun = !!(params.tavily_api_key || process.env.TAVILY_API_KEY)
  const pending: string[] = ['BZP', 'persons']
  if (krsNumber) pending.push('rejestrio_v2')
  if (tavilyWillRun) pending.push('tavily')
  if (params.apify_api_token) pending.push('Apify_GMaps')
  if (params.anthropic_api_key) {
    pending.push('AI_business_analysis')
    // Sprint S6A Step 2 — final Protocol 13 layer: AI rescore TOP-10 matches
    // per-client після всіх sources. Може бути gracefully skipped в runPhaseB
    // якщо budget tracker сигналізує про timeout risk.
    pending.push('AI_match_rescore')
  }
  response.phase_b_pending = pending

  after(async () => {
    await runPhaseB({
      clientId: phaseB_clientId,
      nip: phaseB_nip,
      entityType: phaseB_entityType,
      krsNumber: phaseB_krsNumber,
      params: phaseB_params,
    })
  })

  return NextResponse.json({ ok: true, response, phase: 'A_complete', enrichment_pending: true })
}

/** PHASE B — buying signals + people + Tavily + Apify + AI + final
 *  match recompute. Runs after response sent. Errors logged до
 *  enrichment_log; не surface back до user. */
async function runPhaseB({
  clientId,
  nip,
  entityType,
  krsNumber,
  params,
}: {
  clientId: string
  nip: string
  entityType: LookupResponse['entity_type']
  krsNumber: string | null
  params: {
    anthropic_api_key?: string
    gus_api_key?: string
    apify_api_token?: string
    krs_rejestr_api_token?: string
  }
}): Promise<void> {
  const supabase = await createClient()

  // Sprint S6A Step 2 — Phase B budget tracker для AI_match_rescore guard.
  // Vercel function ceiling 120s; safety margin 10s перш ніж STEP 7 має bail
  // gracefully (зберегти решту Phase B work від timeout).
  const PHASE_B_BUDGET_MS = 110_000
  const phaseBStartedAt = Date.now()

  // Lightweight response object для helper compat (mostly to track per-step
  // status у enrichment_log; not surfaced до user).
  const response: LookupResponse = {
    client_id: clientId,
    entity_type: entityType,
    sources_completed: [],
    fields_filled: 0,
    persons_created: 0,
    top_matches: [],
    errors: [],
  }

  // ─── STEP 3: Buying signals (BZP + rejestr.io v2 comprehensive, parallel) ───
  // Sprint S1 Phase 4: replaced legacy fetchSprawozdania/fetchMsigChanges
  // з comprehensive runRejestrioStep що handles wszystkie 9 v2 endpoints.
  await Promise.allSettled([
    runBzpStep(supabase, clientId, nip, response),
    krsNumber
      ? runRejestrioStep(supabase, clientId, krsNumber, params.krs_rejestr_api_token, response)
      : Promise.resolve(),
  ])

  // ─── STEP 4: People extraction ───
  await extractAndCreatePersons(
    supabase,
    clientId,
    entityType,
    krsNumber,
    response,
    params.anthropic_api_key,
  )

  // ─── STEP 4.5: Online presence (Tavily web search) ───
  // Sprint L Phase 2 — find website / Facebook / Instagram / news mentions.
  // Sprint S5C — params first, env fallback (grace period). Vercel
  // env TAVILY_API_KEY zostaje dopóki migrate całego deployment, usunie
  // się w S6.
  const tavilyKey = params.tavily_api_key || process.env.TAVILY_API_KEY || ''
  if (tavilyKey) {
    const runId = await startEnrichmentRun(supabase, {
      target_type: 'company',
      target_id: clientId,
      source: 'tavily',
    })
    try {
      const { data: targetRow } = await supabase
        .from('clients')
        .select('title')
        .eq('id', clientId)
        .single()
      const t = targetRow as { title: string } | null
      if (t) {
        const web = await searchCompanyOnline(tavilyKey, t.title, nip)
        const fields: Array<{ field_key: string; value: { value_text?: string; value_json?: unknown } }> = []
        if (web.website_url) fields.push({ field_key: 'website', value: { value_text: web.website_url } })
        if (web.facebook_url) fields.push({ field_key: 'facebook_url', value: { value_text: web.facebook_url } })
        if (web.instagram_url) fields.push({ field_key: 'instagram_url', value: { value_text: web.instagram_url } })
        if (web.google_maps_urls.length > 0)
          fields.push({ field_key: 'google_maps_urls', value: { value_json: web.google_maps_urls } })
        if (web.news_mentions.length > 0)
          fields.push({ field_key: 'news_mentions', value: { value_json: web.news_mentions } })
        const merged =
          fields.length > 0
            ? await upsertFields(supabase, { type: 'client', id: clientId }, fields, 'WWW')
            : { added: [], updated: [], unchanged: [], ignored: [] }
        response.fields_filled += merged.added.length + merged.updated.length
        response.sources_completed.push({
          source: 'tavily',
          status: fields.length > 0 ? 'success' : 'partial',
          fields_added: merged.added.length,
          fields_updated: merged.updated.length,
          note: `${web.raw_results.length} raw, $${web.search_cost_usd.toFixed(4)}`,
        })
        await finishEnrichmentRun(supabase, runId, {
          status: 'success',
          fields_added: merged.added,
          fields_updated: merged.updated,
          raw_payload: web,
          cost_usd: web.search_cost_usd,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      response.errors.push(`Tavily: ${msg}`)
      response.sources_completed.push({ source: 'tavily', status: 'error', error: msg })
      await finishEnrichmentRun(supabase, runId, { status: 'error', error_message: msg })
    }
  } else {
    response.sources_completed.push({
      source: 'tavily',
      status: 'skipped',
      note: 'tavily_api_key brak у params (ustaw w /settings → Klucze API) + brak fallbacku TAVILY_API_KEY w env',
    })
  }

  // ─── STEP 5: Apify Google Maps ───
  // Sprint L Phase 1D fix: actually invoke Apify if entity має no existing
  // contact (Sprint J pre-flight check). Earlier orchestrator unconditionally
  // skipped — bug.
  if (params.apify_api_token) {
    const existing = await findExistingContact(supabase, 'client', clientId)
    if (existing) {
      response.sources_completed.push({
        source: 'Apify_GMaps',
        status: 'skipped',
        note: `pre-flight: contact already у ${existing.source}`,
      })
    } else {
      const runId = await startEnrichmentRun(supabase, {
        target_type: 'company',
        target_id: clientId,
        source: 'Apify_GMaps',
      })
      try {
        // Resolve target metadata для Apify call
        const { data: targetRow } = await supabase
          .from('clients')
          .select('title, city, region')
          .eq('id', clientId)
          .single()
        const t = targetRow as { title: string; city: string | null; region: string | null } | null
        if (t) {
          const result = await enrichContactsApify(params.apify_api_token, {
            name: t.title,
            city: t.city,
            voivodeship: t.region,
            nip,
          })
          // Upsert contact_enrichment
          await supabase.from('contact_enrichment').upsert(
            {
              target_type: 'client',
              target_id: clientId,
              source: 'apify_gmaps',
              phone: result.phone,
              email: result.email,
              website: result.website,
              gmaps_url: result.gmaps_url,
              gmaps_rating: result.gmaps_rating,
              gmaps_reviews_count: result.gmaps_reviews_count,
              raw_payload: result.raw_payload,
              status: result.status,
              error_message: result.error_message ?? null,
              cost_usd: result.cost_usd,
              enriched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
            },
            { onConflict: 'target_type,target_id,source' },
          )
          // Write to canonical (when found)
          if (result.status === 'success' || result.status === 'partial') {
            const fields = []
            if (result.phone) fields.push({ field_key: 'phone', value: { value_text: result.phone } })
            if (result.email) fields.push({ field_key: 'email', value: { value_text: result.email } })
            if (result.website) fields.push({ field_key: 'website', value: { value_text: result.website } })
            if (fields.length > 0) await upsertFields(supabase, { type: 'client', id: clientId }, fields, 'Apify_GMaps')
          }
          response.sources_completed.push({
            source: 'Apify_GMaps',
            status: result.status === 'success' || result.status === 'partial' ? 'success' : 'partial',
            note: `${result.status} (cost $${result.cost_usd})`,
          })
          await finishEnrichmentRun(supabase, runId, {
            status: result.status === 'success' ? 'success' : 'partial',
            raw_payload: result.raw_payload,
            cost_usd: result.cost_usd,
            error_message: result.error_message,
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        response.errors.push(`Apify: ${msg}`)
        response.sources_completed.push({ source: 'Apify_GMaps', status: 'error', error: msg })
        await finishEnrichmentRun(supabase, runId, { status: 'error', error_message: msg })
      }
    }
  } else {
    response.sources_completed.push({
      source: 'Apify_GMaps',
      status: 'skipped',
      note: 'apify_api_token missing у params',
    })
  }

  // ─── STEP 6.5: AI business analysis (Claude Haiku) ───
  // Sprint L Phase 3 — analyze всі accumulated signals → business_profile
  // з buyer_strength_for_chm score. Drives Phase 4 score recalibration.
  try {
    const { data: paramsRow2 } = await supabase
      .from('params')
      .select('anthropic_api_key')
      .limit(1)
      .maybeSingle()
    const anthropicKey = (paramsRow2 as { anthropic_api_key?: string } | null)?.anthropic_api_key ?? ''
    if (anthropicKey) {
      const aiRunId = await startEnrichmentRun(supabase, {
        target_type: 'company',
        target_id: clientId,
        source: 'AI_business_analysis',
      })
      const aiResult = await analyzeBusinessProfile(supabase, anthropicKey, clientId)
      if (aiResult.profile) {
        response.sources_completed.push({
          source: 'AI_business_analysis',
          status: 'success',
          note: `format=${aiResult.profile.business_format}, buyer_strength=${aiResult.profile.buyer_strength_for_chm}, cost $${aiResult.cost_usd.toFixed(4)}`,
        })
        await finishEnrichmentRun(supabase, aiRunId, {
          status: 'success',
          raw_payload: aiResult.profile,
          cost_usd: aiResult.cost_usd,
        })
      } else {
        response.sources_completed.push({
          source: 'AI_business_analysis',
          status: 'error',
          error: aiResult.error,
        })
        await finishEnrichmentRun(supabase, aiRunId, {
          status: 'error',
          error_message: aiResult.error,
        })
      }
    } else {
      response.sources_completed.push({
        source: 'AI_business_analysis',
        status: 'skipped',
        note: 'anthropic_api_key missing у params',
      })
    }
  } catch (err) {
    response.errors.push(`AI: ${err instanceof Error ? err.message : err}`)
  }

  // ─── STEP 6 final: re-compute matches (тепер з business_profile niche bonus) ───
  try {
    await computeMatchesForClient(supabase, clientId)
  } catch (err) {
    console.error('[PhaseB] final match recompute failed:', err)
  }

  // ─── STEP 7 — AI rescore TOP-10 matches per-client (Sprint S6A Step 2) ───
  // Final layer Protocol 13: AI re-score з ПОВНИМ contextom з усіх sources
  // (BZP + rejestrio + Tavily + Apify + business_profile + final algo recompute).
  // Захищено budget tracker — gracefully skip якщо <15s залишилось до 120s
  // ceiling. Trade-off: occasional skipped rescore vs гарантовано не lose
  // решту Phase B work через timeout.
  // TODO (S6A.5 if timeout issues): Розглянути винесення AI_match_rescore у
  // окремий after() chain з runPhaseB. Trade-off: lose Protocol 13 ordering
  // (AI має final context з business_profile). Зараз: захищаємо timeout
  // budget, gracefully skip якщо не встигаємо.
  if (params.anthropic_api_key && clientId) {
    const elapsedSoFar = Date.now() - phaseBStartedAt
    const remainingBudget = PHASE_B_BUDGET_MS - elapsedSoFar
    const RESCORE_BUDGET_MS = 15_000

    const rescoreRunId = await startEnrichmentRun(supabase, {
      target_type: 'company',
      target_id: clientId,
      source: 'AI_match_rescore',
    })

    if (remainingBudget < RESCORE_BUDGET_MS) {
      // Skip — not enough time. Log як 'partial' (не 'error') so UI знає
      // що це intentional skip, не bug.
      await finishEnrichmentRun(supabase, rescoreRunId, {
        status: 'partial',
        error_message: `Skipped: only ${Math.floor(remainingBudget / 1000)}s budget remaining (need ${RESCORE_BUDGET_MS / 1000}s)`,
        raw_payload: { skipped: true, elapsed_ms: elapsedSoFar },
      })
    } else {
      try {
        const result = await rescoreClientTop10(
          supabase,
          params.anthropic_api_key,
          clientId,
        )
        await finishEnrichmentRun(supabase, rescoreRunId, {
          status: result.ok ? 'success' : 'error',
          cost_usd: result.cost_usd,
          error_message: result.error,
          raw_payload: {
            rescored_count: result.rescored,
            elapsed_ms: Date.now() - phaseBStartedAt,
          },
        })
      } catch (err) {
        await finishEnrichmentRun(supabase, rescoreRunId, {
          status: 'error',
          error_message: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }
}

// ─── STEP 3 helpers ───
async function runBzpStep(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  nip: string,
  response: LookupResponse,
): Promise<void> {
  const runId = await startEnrichmentRun(supabase, {
    target_type: 'company',
    target_id: clientId,
    source: 'BZP',
  })
  try {
    const notices = await searchBzpByWinnerNip(nip)
    const cleanNip = nip.replace(/\D/g, '')
    let inserted = 0
    for (const n of notices) {
      // Strict: only persist коли matched winner NIP === client NIP. Searcher
      // already filters but defense in depth — never stamp client.nip on
      // winner_nip via fallback.
      const winnerNip = n.winner?.nip ?? null
      const candidates = n.winner?.candidates ?? []
      const matched =
        winnerNip === cleanNip ||
        (winnerNip === null && candidates.includes(cleanNip))
      if (!matched) continue
      const { error } = await supabase.from('bzp_tenders').upsert(
        {
          bzp_notice_id: n.noticeId,
          client_id: clientId,
          winner_nip: cleanNip,
          winner_name: n.winner?.name ?? null,
          ordering_party: n.orderingParty.name,
          ordering_party_type: n.orderingParty.type,
          cpv_codes: n.cpvCodes,
          subject: n.subject,
          award_value_pln: n.contractValue,
          award_date: n.awardDate,
          contract_period: n.contractPeriod,
          raw_payload: n.raw,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'bzp_notice_id' },
      )
      if (!error) inserted++
    }
    response.sources_completed.push({
      source: 'BZP',
      status: 'success',
      fields_added: inserted,
      note: `${notices.length} notices (${inserted} stored)`,
    })
    await finishEnrichmentRun(supabase, runId, {
      status: 'success',
      raw_payload: { count: notices.length },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    response.errors.push(`BZP: ${msg}`)
    response.sources_completed.push({ source: 'BZP', status: 'error', error: msg })
    await finishEnrichmentRun(supabase, runId, { status: 'error', error_message: msg })
  }
}

// Sprint S1 Phase 4: legacy runSprawozdaniaStep + runMsigStep removed —
// fully replaced by runRejestrioStep що uses lib/rejestrio/* v2 modules.
// Old company_financials i msig_changes tables stay як read-only legacy
// stores — будут eventually replaced by financial_statements + (future)
// monitor_changes table.

// ─── Sprint S1 — comprehensive rejestr.io v2 step ───
// Replaces legacy fetchSprawozdania + fetchMsigChanges. Calls all 9 v2
// endpoints (org-basic, ogolny, przeksztalcenia, wzmianki, oddzialy,
// sprawozdania, osoby per zarzad, crbr) i persists у nowych tabel +
// columns clients (Sprint S1 Phase 1 migrations 036-041).
async function runRejestrioStep(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  krsNumber: string,
  apiKey: string | undefined,
  response: LookupResponse,
): Promise<void> {
  const runId = await startEnrichmentRun(supabase, {
    target_type: 'company',
    target_id: clientId,
    source: 'rejestrio_v2',
  })
  if (!apiKey) {
    response.sources_completed.push({ source: 'rejestrio_v2', status: 'skipped', note: 'no token' })
    await finishEnrichmentRun(supabase, runId, { status: 'partial', error_message: 'no API key' })
    return
  }

  const krs = krsNumber.padStart(10, '0')
  const summary: Record<string, number> = {}
  const errors: string[] = []

  try {
    // 1. /org/{krs} — rejestrio_org_id, employees_count
    const orgBasic = await fetchOrgBasic(apiKey, krs)
    if (orgBasic) {
      await supabase
        .from('clients')
        .update({
          rejestrio_org_id: orgBasic.rejestrio_org_id,
          employees_count: orgBasic.employees_count,
        })
        .eq('id', clientId)
      summary.org_basic = 1
    }
  } catch (e) {
    errors.push(`org-basic: ${e instanceof Error ? e.message : e}`)
  }

  let zarzadList: { rejestrio_person_id: number | null; imie: string | null; nazwisko: string | null; funkcja: string | null }[] = []

  try {
    // 2. rozdzial-ogolny
    const ogolny = await fetchRozdzialOgolny(apiKey, krs)
    await supabase
      .from('clients')
      .update({
        email_krs: ogolny.email_krs,
        website_krs: ogolny.website_krs,
        kapital_zakladowy: ogolny.kapital_zakladowy,
        kapital_akcyjny: ogolny.kapital_akcyjny,
        opp_status: ogolny.opp_status,
        founded_at: ogolny.founded_at,
        suspended_at: ogolny.suspended_at,
      })
      .eq('id', clientId)
    summary.ogolny_fields = 1

    // Persons z zarzad/prokurenci/wspolnicy → upsert persons + person_company_links
    zarzadList = ogolny.zarzad
    const allPersons = [...ogolny.zarzad, ...ogolny.prokurenci, ...ogolny.wspolnicy]
    let personsUpserted = 0
    for (const p of allPersons) {
      if (!p.rejestrio_person_id) continue
      // Upsert persons (real names from Biznes plan)
      const { data: pIns, error: pErr } = await supabase
        .from('persons')
        .upsert(
          {
            rejestrio_person_id: p.rejestrio_person_id,
            imie: p.imie,
            nazwisko: p.nazwisko ?? '?',
            zrodla_pol: { imie: 'rejestrio_v2', nazwisko: 'rejestrio_v2' },
            source: 'rejestrio_v2',
          },
          { onConflict: 'rejestrio_person_id' },
        )
        .select('id')
        .single()
      if (pErr || !pIns) continue
      const personId = (pIns as { id: string }).id

      // Link to client (idempotent — check existing)
      const { data: existing } = await supabase
        .from('person_company_links')
        .select('id')
        .eq('client_id', clientId)
        .eq('person_id', personId)
        .maybeSingle()
      if (!existing) {
        await supabase.from('person_company_links').insert({
          person_id: personId,
          client_id: clientId,
          rola: p.funkcja ?? 'Członek',
          jest_decyzyjny:
            (p.funkcja ?? '').toLowerCase().includes('prezes') ||
            (p.funkcja ?? '').toLowerCase().includes('zarząd'),
          zrodlo: 'rejestrio_v2',
        })
      }
      personsUpserted++
    }
    summary.persons_upserted = personsUpserted
  } catch (e) {
    errors.push(`ogolny: ${e instanceof Error ? e.message : e}`)
  }

  try {
    // 3. rozdzial-przeksztalcenia → red flags
    const flags = await fetchRozdzialPrzeksztalcenia(apiKey, krs)
    await supabase
      .from('clients')
      .update({
        bankruptcy_flag: flags.bankruptcy_flag,
        liquidation_flag: flags.liquidation_flag,
        restructuring_flag: flags.restructuring_flag,
      })
      .eq('id', clientId)
    summary.red_flags =
      Number(flags.bankruptcy_flag) + Number(flags.liquidation_flag) + Number(flags.restructuring_flag)
  } catch (e) {
    errors.push(`przeksztalcenia: ${e instanceof Error ? e.message : e}`)
  }

  try {
    // 4. rozdzial-wzmianki → last_filing_date
    const wzm = await fetchRozdzialWzmianki(apiKey, krs)
    if (wzm.last_filing_date) {
      await supabase.from('clients').update({ last_filing_date: wzm.last_filing_date }).eq('id', clientId)
      summary.last_filing = 1
    }
  } catch (e) {
    errors.push(`wzmianki: ${e instanceof Error ? e.message : e}`)
  }

  try {
    // 5. rozdzial-oddzialy
    const odd = await fetchRozdzialOddzialy(apiKey, krs)
    await supabase
      .from('clients')
      .update({ branch_offices_count: odd.branch_offices_count })
      .eq('id', clientId)
    summary.oddzialy = odd.branch_offices_count
  } catch (e) {
    errors.push(`oddzialy: ${e instanceof Error ? e.message : e}`)
  }

  try {
    // 6. sprawozdania (XBRL JSON) → financial_statements rows
    const fins = await fetchAllFinancials(apiKey, krs)
    let finInserted = 0
    for (const f of fins) {
      const { error } = await supabase.from('financial_statements').upsert(
        {
          client_id: clientId,
          krs_doc_id: f.primary_doc_id,
          okres_data_start: f.okres_data_start,
          okres_data_koniec: f.okres_data_koniec,
          przychody_netto: f.fields.przychody_netto,
          zysk_netto: f.fields.zysk_netto,
          aktywa_razem: f.fields.aktywa_razem,
          liczba_pracownikow: f.fields.liczba_pracownikow,
          raw_xbrl_json: f.raw_xbrl_combined,
          source: 'rejestrio_v2',
        },
        { onConflict: 'client_id,okres_data_koniec' },
      )
      if (!error) finInserted++
    }
    summary.financial_years = finInserted
  } catch (e) {
    errors.push(`sprawozdania: ${e instanceof Error ? e.message : e}`)
  }

  try {
    // 7. per zarzad person — /osoby/{id} update real names + powiazania
    let networkLinks = 0
    for (const p of zarzadList) {
      if (!p.rejestrio_person_id) continue
      // Update names (Biznes plan dał їх already у rozdzial-ogolny, але це
      // double-check). Then fetch network links.
      const network = await fetchPersonNetwork(apiKey, p.rejestrio_person_id)
      if (network.length === 0) continue

      const { data: pRow } = await supabase
        .from('persons')
        .select('id')
        .eq('rejestrio_person_id', p.rejestrio_person_id)
        .maybeSingle()
      const sourcePersonId = (pRow as { id: string } | null)?.id
      if (!sourcePersonId) continue

      for (const link of network) {
        const { error } = await supabase.from('person_network_links').insert({
          source_person_id: sourcePersonId,
          linked_krs: link.linked_krs,
          linked_company_name: link.linked_company_name,
          relation_type: link.relation_type,
          relation_kierunek: link.relation_kierunek,
          data_start: link.data_start,
          data_koniec: link.data_koniec,
        })
        if (!error) networkLinks++
      }
    }
    summary.person_network_links = networkLinks
  } catch (e) {
    errors.push(`network: ${e instanceof Error ? e.message : e}`)
  }

  try {
    // 8. crbr beneficjenci
    const beneficiaries = await fetchCrbr(apiKey, krs)
    let crbrInserted = 0
    for (const b of beneficiaries) {
      const { error } = await supabase.from('crbr_beneficiaries').upsert(
        {
          client_id: clientId,
          rejestrio_person_id: b.rejestrio_person_id,
          imie: b.imie,
          nazwisko: b.nazwisko,
          kraj_rezydencji: b.kraj_rezydencji,
          obywatelstwa: b.obywatelstwa,
          rola: b.rola,
        },
        { onConflict: 'client_id,rejestrio_person_id' },
      )
      if (!error) crbrInserted++
    }
    summary.crbr_beneficiaries = crbrInserted
  } catch (e) {
    errors.push(`crbr: ${e instanceof Error ? e.message : e}`)
  }

  const overallStatus = errors.length === 0 ? 'success' : errors.length < 5 ? 'partial' : 'error'
  response.sources_completed.push({
    source: 'rejestrio_v2',
    status: overallStatus,
    note: `${Object.entries(summary).map(([k, v]) => `${k}=${v}`).join(', ')}${errors.length ? ` | errors: ${errors.length}` : ''}`,
  })
  await finishEnrichmentRun(supabase, runId, {
    status: overallStatus,
    raw_payload: { summary, errors },
    error_message: errors.length > 0 ? errors.join('; ').slice(0, 500) : undefined,
  })
}

// ─── STEP 4 — extract persons z KRS zarząd / website ───
async function extractAndCreatePersons(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  entityType: LookupResponse['entity_type'],
  krsNumber: string | null,
  response: LookupResponse,
  anthropicKey: string | undefined,
): Promise<number> {
  let created = 0

  // From KRS zarząd (already stored у company_profile_fields.krs_management_board).
  // Sprint M FIX 8: KRS API anonymizes names per RODO. Members come як
  // { function, index } з lib/enrichment/krs.ts:extractBoard. We create
  // placeholder persons keyed на role, name placeholder "(KRS anon)",
  // щоб PeopleSection показала existing zarząd structure. User edytuje
  // imię/nazwisko вручну or after Apify/website scrape adds them.
  const { data: boardField } = await supabase
    .from('company_profile_fields')
    .select('value_json')
    .eq('client_id', clientId)
    .eq('field_key', 'krs_management_board')
    .is('superseded_at', null)
    .maybeSingle()
  const board =
    (boardField as {
      value_json: Array<{
        function?: string | null
        index?: number
        name?: string
        surname?: string
        functionName?: string
        funkcjaWOrganie?: string
      }>
    } | null)?.value_json
  if (Array.isArray(board)) {
    for (const member of board) {
      const rola =
        member.funkcjaWOrganie ??
        member.functionName ??
        member.function ??
        'Członek Zarządu'
      const explicitName = [member.name, member.surname].filter(Boolean).join(' ').trim()

      // Use explicit name if present (older API shape); otherwise anonymized
      // placeholder з role + index.
      let imie: string
      let nazwisko: string
      if (explicitName) {
        const parts = explicitName.split(/\s+/)
        imie = parts[0] ?? ''
        nazwisko = parts.slice(1).join(' ') || '?'
      } else {
        imie = '(KRS anon)'
        nazwisko = `${rola} ${member.index ?? ''}`.trim()
      }

      // Dedup by (client_id, rola) — skip if a link з cим rola вже existeje
      const { data: existingLink } = await supabase
        .from('person_company_links')
        .select('id, person_id')
        .eq('client_id', clientId)
        .ilike('rola', rola)
        .limit(1)
      if (existingLink && existingLink.length > 0) continue

      const { data: ins } = await supabase
        .from('persons')
        .insert({
          imie,
          nazwisko,
          zrodla_pol: { rola: 'KRS', imie: 'KRS', nazwisko: 'KRS' },
        })
        .select('id')
        .single()
      if (ins) {
        await supabase.from('person_company_links').insert({
          person_id: (ins as { id: string }).id,
          client_id: clientId,
          rola,
          jest_decyzyjny:
            rola.toLowerCase().includes('prezes') || rola.toLowerCase().includes('zarząd'),
          zrodlo: 'KRS',
        })
        created++
      }
    }
  }

  // From website (если URL знайдено в profile fields)
  const { data: websiteField } = await supabase
    .from('company_profile_fields')
    .select('value_text')
    .eq('client_id', clientId)
    .eq('field_key', 'website')
    .is('superseded_at', null)
    .maybeSingle()
  const websiteUrl = (websiteField as { value_text: string | null } | null)?.value_text
  if (websiteUrl && anthropicKey) {
    const runId = await startEnrichmentRun(supabase, {
      target_type: 'company',
      target_id: clientId,
      source: 'WWW',
    })
    try {
      const result = await extractFromWebsite(websiteUrl, anthropicKey)
      let wwwCreated = 0
      for (const p of result.persons.filter((x) => x.confidence >= 0.7)) {
        if (!p.imie || !p.nazwisko) continue
        // Dedup by email або name
        const { data: existing } = p.email
          ? await supabase.from('persons').select('id').eq('email_glowny', p.email).limit(1)
          : { data: null }
        if (existing && existing.length > 0) continue
        const { data: ins } = await supabase
          .from('persons')
          .insert({
            imie: p.imie,
            nazwisko: p.nazwisko,
            email_glowny: p.email,
            telefon_komorkowy: p.telefon,
            zrodla_pol: { imie: 'WWW', email: 'WWW', telefon: 'WWW' },
          })
          .select('id')
          .single()
        if (ins) {
          await supabase.from('person_company_links').insert({
            person_id: (ins as { id: string }).id,
            client_id: clientId,
            rola: p.rola ?? 'Kontakt',
            zrodlo: 'WWW',
            sila_relacji: Math.round(p.confidence * 100),
          })
          wwwCreated++
        }
      }
      created += wwwCreated
      response.sources_completed.push({
        source: 'WWW',
        status: 'success',
        fields_added: wwwCreated,
        note: `${result.persons.length} candidates, ${wwwCreated} created`,
      })
      await finishEnrichmentRun(supabase, runId, {
        status: 'success',
        raw_payload: { ...result, persons_created: wwwCreated },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      response.sources_completed.push({ source: 'WWW', status: 'error', error: msg })
      await finishEnrichmentRun(supabase, runId, { status: 'error', error_message: msg })
    }
  } else if (entityType === 'JDG') {
    // CEIDG owner = single person — already encoded в clients.gus_data fiz_imie1+fiz_nazwisko
    const { data: ownerField } = await supabase
      .from('clients')
      .select('gus_data')
      .eq('id', clientId)
      .maybeSingle()
    const gusData = (ownerField as { gus_data: { report?: { root?: { dane?: Record<string, string> | Record<string, string>[] } } } | null } | null)?.gus_data
    const reportData = gusData?.report?.root?.dane
    const reportFlat: Record<string, string | undefined> = Array.isArray(reportData)
      ? (reportData[0] ?? {})
      : ((reportData as Record<string, string | undefined>) ?? {})
    const imie = reportFlat.fiz_imie1
    const nazwisko = reportFlat.fiz_nazwisko
    if (imie && nazwisko) {
      // Check existing
      const { data: existing } = await supabase
        .from('person_company_links')
        .select('id')
        .eq('client_id', clientId)
        .ilike('rola', 'Właściciel')
        .limit(1)
      if (!existing || existing.length === 0) {
        const { data: ins } = await supabase
          .from('persons')
          .insert({
            imie,
            nazwisko,
            zrodla_pol: { imie: 'GUS', nazwisko: 'GUS' },
          })
          .select('id')
          .single()
        if (ins) {
          await supabase.from('person_company_links').insert({
            person_id: (ins as { id: string }).id,
            client_id: clientId,
            rola: 'Właściciel',
            jest_decyzyjny: true,
            zrodlo: 'GUS',
          })
          created++
        }
      }
    }
  }

  return created
}
