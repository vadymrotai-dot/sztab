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
// Sprint TYDZIEN1.A.3 (27.05.2026) — regex-based contact extractor (no AI cost)
import { extractWebsiteRegex } from '@/lib/enrichment/website-regex'
import { upsertField, upsertFields } from '@/lib/profile/merge'
import { findExistingContact } from '@/lib/enrichment/contact-preflight'
import { enrichContactsApify } from '@/lib/enrichment/apify'
import {
  searchCompanyOnline,
  searchCompanyByBrand,
  isAggregatorUrl,
} from '@/lib/enrichment/web-search'
// Sprint S6D Day 2 REVISION (12.05.2026) — Pyszne path DEPRECATED.
// Reason: NO Polish-specific Pyszne actor у Apify Store. Available
// scrapepilot/just-eat-scraper returns UK Subway data для PL queries.
// File preserved у lib/enrichment/pyszne.ts (cheap to revive якщо PL
// actor appears).
// import { enrichMenuPyszne } from '@/lib/enrichment/pyszne' (deprecated)
import { enrichMenuWolt } from '@/lib/enrichment/wolt'
import { extractMenuFromWebsite } from '@/lib/enrichment/website-menu'
import { enrichKrsFullnames, isAnonymizedPerson } from '@/lib/enrichment/krs-fullnames'
import { analyzeBusinessProfile } from '@/lib/ai/business-analysis'
import { getHorecaCategory } from '@/lib/pkd/mapping-2007-2025'
import { startEnrichmentRun, finishEnrichmentRun } from '@/lib/profile/enrichment-log'
import { computeMatchesForClient } from '@/lib/matching/engine'
import { rescoreClientTop10 } from '@/lib/matching/ai-rescore'
// Sprint S-CEIDG-DETAILS Day 1 (15.05.2026) — CEIDG firma details для JDG
// (uprawnienia → brand_aliases). Lazy resolve clients.ceidg_id за NIP при
// першому "Pełna re-analiza" run-i; cached для subsequent runs.
import { CeidgClient } from '@/lib/ceidg/client'
import { extractBrandAliasesFromKoncesje } from '@/lib/intelligence/extract-koncesje'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Sprint TYDZIEN1.A.2.6 (27.05.2026) — RAISED 240 → 260. A.2.4 raised Apify
// cap до 150s, A.2.6 raised to 170s після diagnose. Updated budget math:
// preamble 18s + Apify 170s + AI_business 25s + AI_match 12s + margin 35s = 260s.
// Vercel Pro ceiling 300s, leaves 40s margin.
//
// Sprint TYDZIEN1.A.2.3 (legacy comment): RAISED 120 → 240 after function killed
// at 120s mid-Apify; A.2.6 incremental raise дla covering Apify variance.
export const maxDuration = 260

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

/** Sprint TYDZIEN1.A.2 HOTFIX (27.05.2026) — per-firm budget context.
 *  POST handler creates one ctx + threads через runPhaseB → runRejestrioStep
 *  via parameter chain. Cumulative cost accumulator + threshold check. */
interface LookupBudgetCtx {
  readonly budgetUsd: number
  /** Returns false if cumulative >= budget (caller should skip + log). */
  checkBudget(stepName: string): boolean
  /** Increments cumulative (no-op on null/negative/NaN). */
  addCost(cost: number | null | undefined): void
  /** Current cumulative spend USD (для note strings z budżetu skip). */
  getCumulative(): number
}

function createBudgetCtx(): LookupBudgetCtx {
  const budgetUsd = Number(process.env.PER_FIRM_BUDGET_USD ?? '0.13')
  let cumulative = 0
  return {
    budgetUsd,
    getCumulative: () => cumulative,
    addCost(cost) {
      if (typeof cost === 'number' && cost > 0 && Number.isFinite(cost)) {
        cumulative += cost
      }
    },
    checkBudget(stepName) {
      if (cumulative >= budgetUsd) {
        console.log(
          `[budget] skip ${stepName} — cumulative $${cumulative.toFixed(4)} >= $${budgetUsd.toFixed(4)} (PER_FIRM_BUDGET_USD)`,
        )
        return false
      }
      return true
    },
  }
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
  // Sprint S-CEIDG-DETAILS Day 1 — додано ceidg_api_key для JDG Phase B
  // (resolve clients.nip → firma UUID via /firmy?nip= → uprawnienia via
  // /firma/{uuid}). Key column name: 'ceidg_api_key' per lib/ceidg/client.ts:115.
  const { data: paramsRow } = await supabase
    .from('params')
    .select('anthropic_api_key, gus_api_key, apify_api_token, krs_rejestr_api_token, tavily_api_key, ceidg_api_key')
    .limit(1)
    .maybeSingle()
  const params = (paramsRow ?? {}) as {
    anthropic_api_key?: string
    gus_api_key?: string
    apify_api_token?: string
    krs_rejestr_api_token?: string
    tavily_api_key?: string
    ceidg_api_key?: string
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

  // ─── Sprint TYDZIEN1.A.2.1 (27.05.2026) — Cleanup stuck 'running' rows ────
  // Vercel function timeout / kill leaves enrichment_log rows stuck na
  // status='running' navсekiv (after() promise dropped before finishEnrichmentRun).
  // На entry handler — mark abandoned rows > 5 min as 'error' aby UI/diag
  // не showed misleading "running" forever. Cheap: 1 SELECT + bulk UPDATE.
  if (clientId) {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: stuckRows } = await supabase
      .from('enrichment_log')
      .select('id, source')
      .eq('target_id', clientId)
      .eq('status', 'running')
      .lt('run_started_at', cutoff)
    const stuckCount = (stuckRows ?? []).length
    if (stuckCount > 0) {
      const stuckIds = (stuckRows as Array<{ id: string }>).map((r) => r.id)
      await supabase
        .from('enrichment_log')
        .update({
          status: 'error',
          error_message: 'abandoned: function timeout (cleaned up at handler entry)',
          run_completed_at: new Date().toISOString(),
        })
        .in('id', stuckIds)
      console.log(
        `[lookup] cleanup ${stuckCount} stuck running rows for client ${clientId}`,
      )
    }
  }

  // ─── TYDZIEN1.A.2 (27.05.2026) — Per-firm budget guard ─────────────────────
  // Cumulative cost accumulator + threshold check. Po przekroczeniu budgetu
  // expensive steps są pomijane (Apify_GMaps, sprawozdania JSON, www_menu).
  // Default 0.13 USD ≈ 0.50 zł — twardy cap per analiza klienta.
  // Override via env PER_FIRM_BUDGET_USD дla cohort runs gdzie nas stać.
  //
  // A.2 HOTFIX (27.05.2026): wrapped у ctx object бо runPhaseB/runRejestrioStep
  // = top-level functions (NOT nested) → closure variables nie reachable.
  // Pass ctx via parameter chain.
  const budgetCtx = createBudgetCtx()

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
            // Sprint TYDZIEN1.A.1 (27.05.2026) — siedziba з GUS report (praw_*/fiz_*).
            // Nie nadpisuj jeśli GUS zwrócił null (skip-spread, zostaw istniejącą wartość).
            ...(gus.city ? { city: gus.city } : {}),
            ...(gus.address ? { address: gus.address } : {}),
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
  // Sprint S-CEIDG-DETAILS Day 1 — CEIDG details (uprawnienia → brand_aliases)
  // тільки для JDG, бо `/firma/{uuid}` endpoint покриває JDG; sp.z o.o./S.A.
  // мають свої details у KRS (rejestrio_v2). entityType resolved у Phase A
  // на основі GUS report (line 173-178: legal form keywords or fiz_imie1).
  if (entityType === 'JDG' && params.ceidg_api_key) pending.push('CEIDG_details')
  if (tavilyWillRun) pending.push('tavily')
  if (params.apify_api_token) {
    pending.push('Apify_GMaps')
    // Sprint S6D Day 2 REVISION (12.05.2026) — gastronomia menu scrape +
    // krs-fullnames conditional sources. pyszne_menu DEPRECATED — no PL
    // actor у Apify Store. www_menu added — fetches own restaurant website.
    pending.push('www_menu')
    pending.push('wolt_menu')
    pending.push('regdata_krs_fullnames')
  }
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
      // Sprint TYDZIEN1.A.2 HOTFIX — pass budget ctx (closure factory wraps mutable state)
      budgetCtx,
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
  budgetCtx,
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
    /** Sprint S5C — Tavily web search key (params first, env fallback).
     *  Consumed у STEP 4 (web-search) via `params.tavily_api_key ||
     *  process.env.TAVILY_API_KEY`. */
    tavily_api_key?: string
    /** Sprint S-CEIDG-DETAILS Day 1 — used by runCeidgDetailsStep
     *  для JDG (entityType==='JDG'). Gated у Phase A pending list. */
    ceidg_api_key?: string
  }
  /** Sprint TYDZIEN1.A.2 HOTFIX (27.05.2026) — per-firm budget context. */
  budgetCtx: LookupBudgetCtx
}): Promise<void> {
  const supabase = await createClient()

  // Sprint S6A Step 2 — Phase B budget tracker для AI_match_rescore guard.
  // Sprint TYDZIEN1.A.2.6 (27.05.2026) — RAISED 220_000 → 240_000. Align з
  // maxDuration=260 (A.2.6). 20s reserved для handler return + Phase A response.
  // Budget math: 18s preamble + 170s Apify + 25s AI bus + 12s match + 15s margin
  // = 240s within budget.
  const PHASE_B_BUDGET_MS = 240_000
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

  // Sprint S-DISCOVERY.1 (16.05.2026) — Apify GMaps title surfaced for brand
  // cascade у STEP 6.6. Set у STEP 5 (Apify block) коли status='success' AND
  // name_similarity ≥ 0.5. Used у STEP 6.6 cascade між CEIDG koncesja (priority
  // 1) і AI extracted_brand (priority 3). Domek Sushi-style cases (no CEIDG
  // koncesja, real GMaps presence) tepr win brand-aware Tavily.
  let apifyBusinessName: string | null = null
  let apifyBusinessCategory: string | null = null

  // ─── STEP 3: Buying signals (BZP + rejestr.io v2 comprehensive, parallel) ───
  // Sprint S1 Phase 4: replaced legacy fetchSprawozdania/fetchMsigChanges
  // з comprehensive runRejestrioStep що handles wszystkie 9 v2 endpoints.
  await Promise.allSettled([
    runBzpStep(supabase, clientId, nip, response),
    krsNumber
      ? runRejestrioStep(supabase, clientId, krsNumber, params.krs_rejestr_api_token, response, budgetCtx)
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
        .select('title, website_krs, email_krs')
        .eq('id', clientId)
        .single()
      const t = targetRow as {
        title: string
        website_krs: string | null
        email_krs: string | null
      } | null
      if (t) {
        // Sprint TYDZIEN1.A.1.3 — derive KRS domain hint (website_krs preferred,
        // fallback email domain) for authoritative override of Tavily website pick.
        const krsDomainHint =
          (t.website_krs && t.website_krs.trim()) ||
          (t.email_krs && t.email_krs.includes('@')
            ? t.email_krs.split('@')[1] ?? null
            : null) ||
          null
        const web = await searchCompanyOnline(tavilyKey, t.title, nip, krsDomainHint)
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

  // ─── STEP 4.6: Website regex scrape (TYDZIEN1.A.3 — 27.05.2026) ────────────
  // Free phone/email/social extractor — fetches homepage + /kontakt + /contact
  // + /o-nas, runs Polish phone regex + email regex + facebook/instagram/linkedin
  // detection. No AI cost ($0). Source-of-truth dla phone gdy Apify GMaps fails
  // (timeout, wrong-firm match, cost_guard tripped).
  //
  // Source URL priority: website_krs (authoritative KRS-registered) > Tavily-found
  // website (company_profile_fields[website]). Skip jeśli neither populated.
  //
  // Idempotency: skip jeśli recent successful website_scrape row < 30 days
  // (no schema migration — uses enrichment_log).
  if (clientId) {
    // Resolve target URL — prefer website_krs (canonical), fallback Tavily website
    const { data: wsClient } = await supabase
      .from('clients')
      .select('website_krs')
      .eq('id', clientId)
      .single()
    const { data: wsField } = await supabase
      .from('company_profile_fields')
      .select('value_text')
      .eq('client_id', clientId)
      .eq('field_key', 'website')
      .is('superseded_at', null)
      .maybeSingle()
    const wsKrs = (wsClient as { website_krs?: string | null } | null)?.website_krs ?? null
    const wsTavily = (wsField as { value_text?: string | null } | null)?.value_text ?? null
    const rawWebsiteUrl = wsKrs || wsTavily
    if (!rawWebsiteUrl) {
      response.sources_completed.push({
        source: 'website_scrape',
        status: 'skipped',
        note: 'no website URL (KRS or Tavily)',
      })
    } else {
      // Normalize URL: ensure scheme, strip trailing slash
      let normalizedUrl = rawWebsiteUrl.trim()
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl.replace(/^www\./i, '')}`
      }
      normalizedUrl = normalizedUrl.replace(/\/$/, '')

      // Idempotency: skip jeśli recent successful row exists <30d
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: recentScrape } = await supabase
        .from('enrichment_log')
        .select('id, run_started_at')
        .eq('target_id', clientId)
        .eq('target_type', 'company')
        .eq('source', 'website_scrape')
        .eq('status', 'success')
        .gte('run_started_at', cutoff)
        .order('run_started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (recentScrape) {
        const lastRun = (recentScrape as { run_started_at: string }).run_started_at
        response.sources_completed.push({
          source: 'website_scrape',
          status: 'skipped',
          note: `cached: last success ${lastRun.slice(0, 10)} (<30d)`,
        })
      } else {
        const wsRunId = await startEnrichmentRun(supabase, {
          target_type: 'company',
          target_id: clientId,
          source: 'website_scrape',
        })
        try {
          const wsResult = await extractWebsiteRegex(normalizedUrl)
          // Sprint TYDZIEN1.A.3 — additional spam filter beyond what
          // website-regex.ts already does. Caught у smoke test maczfit.pl:
          //   - Sentry DSN-like: <hash>@ingest.sentry.<host>
          //   - CSS font fragments: 'wght@200..700' (consecutive dots in domain)
          //   - Common monitoring/tracking false positives
          const cleanEmails = wsResult.emails.filter((e) => {
            if (/\.{2,}/.test(e)) return false                  // consecutive dots
            if (/sentry|ingest|datadog|newrelic|honeybadger/i.test(e)) return false
            if (/^[a-f0-9]{16,}@/i.test(e)) return false        // hash-prefix DSN
            // basic shape: must have actual TLD (≥2 chars after final dot)
            const parts = e.split('@')[1] ?? ''
            if (!/\.[a-z]{2,}$/i.test(parts)) return false
            return true
          })
          // Promote to canonical fields (only якщо нової wartości; не nadpisuj
          // existing populated values). KRS-derived phones/emails are highest
          // trust; website_scrape gets 'medium' confidence-equivalent.
          const wsFields: Array<{
            field_key: string
            value: { value_text?: string; value_json?: unknown }
          }> = []
          if (wsResult.phones.length > 0) {
            wsFields.push({ field_key: 'phone', value: { value_text: wsResult.phones[0]! } })
          }
          if (cleanEmails.length > 0) {
            wsFields.push({ field_key: 'email', value: { value_text: cleanEmails[0]! } })
          }
          if (wsResult.facebook_url) {
            wsFields.push({
              field_key: 'facebook_url',
              value: { value_text: wsResult.facebook_url },
            })
          }
          if (wsResult.instagram_url) {
            wsFields.push({
              field_key: 'instagram_url',
              value: { value_text: wsResult.instagram_url },
            })
          }
          const wsMerged =
            wsFields.length > 0
              ? await upsertFields(
                  supabase,
                  { type: 'client', id: clientId },
                  wsFields,
                  'website_scrape',
                )
              : { added: [], updated: [], unchanged: [], ignored: [] }
          response.fields_filled += wsMerged.added.length + wsMerged.updated.length
          const wsStatus =
            wsResult.phones.length > 0 || cleanEmails.length > 0 ? 'success' : 'partial'
          response.sources_completed.push({
            source: 'website_scrape',
            status: wsStatus,
            fields_added: wsMerged.added.length,
            fields_updated: wsMerged.updated.length,
            note: `${wsResult.phones.length}ph, ${cleanEmails.length}em (${wsResult.emails.length} raw), ${wsResult.pages_fetched.length} pages`,
          })
          await finishEnrichmentRun(supabase, wsRunId, {
            status: wsStatus,
            fields_added: wsMerged.added,
            fields_updated: wsMerged.updated,
            raw_payload: wsResult,
            cost_usd: 0,
          })
        } catch (wsErr) {
          const wsMsg = wsErr instanceof Error ? wsErr.message : String(wsErr)
          response.errors.push(`website_scrape: ${wsMsg}`)
          response.sources_completed.push({
            source: 'website_scrape',
            status: 'error',
            error: wsMsg,
          })
          await finishEnrichmentRun(supabase, wsRunId, {
            status: 'error',
            error_message: wsMsg,
          })
        }
      }
    }
  }

  // ─── STEP 5: Apify Google Maps ───
  // Sprint L Phase 1D fix: actually invoke Apify if entity має no existing
  // contact (Sprint J pre-flight check). Earlier orchestrator unconditionally
  // skipped — bug.
  //
  // ─── STEP 6.8 (S-DATA.2.A.6.8, 22.05.2026): b2b_bad_fit skip ───
  // Phase 1 spike (22.05) confirmed Apify GMaps wrong tool для B2B —
  // 23% success rate у cohort UC_HURT_WARZYWA_OWOCE, plus fuzzy name match
  // подбирає consumer-facing businesses з similar prefix (Continental Opony
  // case). Skip apify_gmaps для clients з existing classification
  // hurtownia/sklep_detal/sieci_handlowe (AI-classified у STEP 6.5 попередніх
  // analyses). First-ever analyses (без classification) ще запускають GMaps.
  // Replacement path = Panorama/ALEO (S-DATA.2.A, currently deferred per
  // Phase 1 fail closure 22.05).
  const { data: existingClassRow } = await supabase
    .from('clients')
    .select('business_profile')
    .eq('id', clientId)
    .maybeSingle()
  const existingClientTypeForGmaps =
    (existingClassRow as { business_profile?: { client_type?: string } } | null)
      ?.business_profile?.client_type ?? null
  const skipApifyGmapsForB2B =
    existingClientTypeForGmaps === 'hurtownia' ||
    existingClientTypeForGmaps === 'sklep_detal' ||
    existingClientTypeForGmaps === 'sieci_handlowe'

  if (skipApifyGmapsForB2B) {
    console.warn('[apify_gmaps] skipped — b2b_bad_fit (Step 6.8)', {
      clientId,
      client_type: existingClientTypeForGmaps,
    })
    await supabase.from('contact_enrichment').upsert(
      {
        target_type: 'client',
        target_id: clientId,
        source: 'apify_gmaps',
        status: 'skipped',
        error_message: `b2b_bad_fit: client_type=${existingClientTypeForGmaps}`,
        raw_payload: {
          skip_reason: 'b2b_bad_fit',
          client_type: existingClientTypeForGmaps,
          step: '6.8',
          cowork_session: 'S-DATA.2.A.6.8 22.05.2026',
        },
        cost_usd: 0,
        enriched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      { onConflict: 'target_type,target_id,source' },
    )
    response.sources_completed.push({
      source: 'Apify_GMaps',
      status: 'skipped',
      note: `b2b_bad_fit: client_type=${existingClientTypeForGmaps}`,
    })
  } else if (params.apify_api_token) {
    const existing = await findExistingContact(supabase, 'client', clientId)
    if (existing) {
      response.sources_completed.push({
        source: 'Apify_GMaps',
        status: 'skipped',
        note: `pre-flight: contact already у ${existing.source}`,
      })
    } else if (!budgetCtx.checkBudget('Apify_GMaps')) {
      // Sprint TYDZIEN1.A.2 — budget guard tripped, skip expensive Apify call
      response.sources_completed.push({
        source: 'Apify_GMaps',
        status: 'skipped',
        note: `budget_exceeded: cumulative $${budgetCtx.getCumulative().toFixed(4)} >= $${budgetCtx.budgetUsd.toFixed(4)}`,
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
          .select('title, city, region, website_krs')
          .eq('id', clientId)
          .single()
        const t = targetRow as {
          title: string
          city: string | null
          region: string | null
          website_krs: string | null
        } | null
        if (t) {
          // Sprint TYDZIEN1.A.2.5 — extract root domain z website_krs (np.
          // 'WWW.MACZFIT.PL' → 'maczfit.pl') dla focused searchQuery + domain
          // match boost у pickBestMatch.
          const websiteDomainHint = t.website_krs
            ? t.website_krs.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || null
            : null
          const result = await enrichContactsApify(params.apify_api_token, {
            name: t.title,
            city: t.city,
            voivodeship: t.region,
            nip,
            // Sprint TYDZIEN1.A.2.1 (27.05.2026) — pass client_type для conditional
            // scrapePlaceDetailPage. existingClientTypeForGmaps already resolved
            // wyżej (Step 6.8 b2b skip-logic) — reuse без osobnego DB fetch.
            clientType: existingClientTypeForGmaps,
            // Sprint TYDZIEN1.A.2.5 — domain hint для query + match boost
            websiteDomain: websiteDomainHint,
          })
          // ─── COST GUARD (S-DATA.2.A.6.8, 22.05.2026) ───
          // Phase 1 spike lesson — PAY_PER_EVENT actors можуть billed per-result
          // (Panorama spike: 100 results × $0.004 ≈ $0.40 = 16x expected).
          // GMaps normally $0.02-0.03/call з maxCrawledPlaces=3. Якщо single
          // call > $0.10 — skip promotion to dedicated cols + canonical
          // fields, mark як 'partial' з cost_guard note. Data залишається у
          // contact_enrichment.raw_payload для audit, але НЕ propagates до
          // clients table. Phase B continues для remaining steps.
          const COST_GUARD_USD = 0.10
          const costGuardTripped = (result.cost_usd ?? 0) > COST_GUARD_USD
          if (costGuardTripped) {
            console.warn('[apify_gmaps] COST GUARD TRIPPED — single call > $0.10', {
              clientId,
              cost_usd: result.cost_usd,
              threshold: COST_GUARD_USD,
            })
          }
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
              raw_payload: costGuardTripped
                ? { ...((result.raw_payload as object) || {}), cost_guard_tripped: true, cost_guard_threshold: COST_GUARD_USD }
                : result.raw_payload,
              status: costGuardTripped ? 'partial' : result.status,
              error_message: costGuardTripped
                ? `cost_guard_tripped: $${result.cost_usd} > $${COST_GUARD_USD} — promotion skipped`
                : (result.error_message ?? null),
              cost_usd: result.cost_usd,
              enriched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
            },
            { onConflict: 'target_type,target_id,source' },
          )
          // Write to canonical (when found AND cost guard не tripped)
          if (
            !costGuardTripped &&
            (result.status === 'success' || result.status === 'partial')
          ) {
            const fields = []
            if (result.phone) fields.push({ field_key: 'phone', value: { value_text: result.phone } })
            if (result.email) fields.push({ field_key: 'email', value: { value_text: result.email } })
            if (result.website) fields.push({ field_key: 'website', value: { value_text: result.website } })
            if (fields.length > 0) await upsertFields(supabase, { type: 'client', id: clientId }, fields, 'Apify_GMaps')
          }
          // Sprint S-DISCOVERY.1 — surface Apify business_name + category для
          // brand cascade у STEP 6.6. business_name gated на success+similarity у
          // apify.ts mapper, тому null для partial/no_match/error без додаткової
          // logic тут. Persists у scope-level let-variable across runPhaseB.
          // Cost guard tripped → НЕ propagate (untrusted match).
          if (!costGuardTripped) {
            apifyBusinessName = result.business_name
            apifyBusinessCategory = result.business_category
          }
          response.sources_completed.push({
            source: 'Apify_GMaps',
            status: costGuardTripped
              ? 'partial'
              : result.status === 'success' || result.status === 'partial'
                ? 'success'
                : 'partial',
            note: costGuardTripped
              ? `cost_guard_tripped: $${result.cost_usd} (promotion skipped)`
              : `${result.status} (cost $${result.cost_usd})`,
          })
          await finishEnrichmentRun(supabase, runId, {
            status: costGuardTripped
              ? 'partial'
              : result.status === 'success'
                ? 'success'
                : 'partial',
            raw_payload: result.raw_payload,
            cost_usd: result.cost_usd,
            error_message: costGuardTripped
              ? `cost_guard_tripped: $${result.cost_usd}`
              : result.error_message,
          })
          // Sprint TYDZIEN1.A.2 — accumulate Apify cost dla budget guard
          budgetCtx.addCost(result.cost_usd)
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

  // ═══════════════════════════════════════════════════════════════════
  // Sprint S-MENU Day 2 (15.05.2026) — STEP 5.5/5.6 WRAPPED у async closure
  // та DEFERRED до post-STEP-6.5. Reason: gates `isGastronomia` /
  // `isHurtowniaLike` read `business_profile.client_type` — це поле AI
  // WRITES у STEP 6.5. Original order had stale-read bug: new JDG-gastronomy
  // clients (e.g. MARCIN BOROWY = Kemer Kebab via CEIDG koncesja) classified
  // ПО STEP 6.5, але www_menu гасnув ще на STEP 5.5 — гате read stale/null
  // client_type. Closure scope captures всі outer vars (params, supabase,
  // clientId, nip, krsNumber, response, etc.) — JavaScript free-variable
  // closures handle this automatically. Invoked after STEP 6.5 — line ~1180+.
  const runDeferredMenuAndKrs = async (): Promise<void> => {
  // STEP 5.5/5.6 — Sprint S6D Day 2 conditional sources за client_type
  // ═══════════════════════════════════════════════════════════════════
  //
  // Two-track architecture (v5):
  //   - gastronomia → menu scrape (Pyszne + Wolt) → ingredients pipeline
  //   - hurtownia/sklep_detal/sieci_handlowe → krs-fullnames (deanonymize KRS)
  //
  // Gating logic uses business_profile.client_type якщо classified, else
  // falls back до PKD-based heuristic (lib/pkd/getHorecaCategory).
  //
  // Sprint S-MENU Day 2: fresh re-fetch tep — AI just wrote business_profile.

  // Load client business_profile + pkd_main для gating decisions.
  const { data: clientGate } = await supabase
    .from('clients')
    .select('title, city, region, business_profile, pkd_codes, pkd_2007_codes')
    .eq('id', clientId)
    .maybeSingle()
  const clientGateRow = clientGate as {
    title: string
    city: string | null
    region: string | null
    business_profile: { client_type?: string } | null
    pkd_codes: string[] | null
    pkd_2007_codes: string[] | null
  } | null
  const clientType = clientGateRow?.business_profile?.client_type ?? null
  const pkdMain =
    clientGateRow?.pkd_2007_codes?.[0] ?? clientGateRow?.pkd_codes?.[0] ?? null
  const horecaCategory = pkdMain ? getHorecaCategory(pkdMain) : 'other'

  const isGastronomia =
    clientType === 'gastronomia' ||
    (!clientType && horecaCategory === 'restaurant')
  const isHurtowniaLike =
    clientType === 'hurtownia' ||
    clientType === 'sklep_detal' ||
    clientType === 'sieci_handlowe' ||
    (!clientType && horecaCategory === 'wholesale')

  // ─── STEP 5.5: WWW menu fetch + Wolt fallback (gastronomia only) ───
  // Sprint S6D Day 2 REVISION (12.05.2026):
  //   - Pyszne path DEPRECATED (no PL actor у Apify Store)
  //   - GMaps menu — already extracted у STEP 5 above (apify.ts now uses
  //     compass/google-maps-extractor + parses dishes у menu_dishes field).
  //     Saves як part of source='apify_gmaps'.
  //   - WWW menu — primary source для повного menu (own restaurant site)
  //   - Wolt — fallback якщо restaurant on Wolt platform
  if (params.apify_api_token && isGastronomia && clientGateRow) {
    // STEP 5.5a — WWW menu fetch (primary source for full menu)
    // Resolve website URL з contact_enrichment.apify_gmaps OR canonical
    // company_profile_fields.website. Prefer GMaps website якщо present
    // (актуальніший, перевірений Google Maps).
    let websiteUrl: string | null = null
    const { data: gmapsRow } = await supabase
      .from('contact_enrichment')
      .select('website')
      .eq('target_type', 'client')
      .eq('target_id', clientId)
      .eq('source', 'apify_gmaps')
      .maybeSingle()
    websiteUrl = (gmapsRow as { website?: string | null } | null)?.website ?? null
    if (!websiteUrl) {
      const { data: webField } = await supabase
        .from('company_profile_fields')
        .select('value_text')
        .eq('client_id', clientId)
        .eq('field_key', 'website')
        .is('superseded_at', null)
        .maybeSingle()
      websiteUrl = (webField as { value_text?: string | null } | null)?.value_text ?? null
    }

    if (websiteUrl && params.anthropic_api_key && budgetCtx.checkBudget('www_menu')) {
      const wwwRunId = await startEnrichmentRun(supabase, {
        target_type: 'company',
        target_id: clientId,
        source: 'www_menu',
      })
      try {
        // Sprint S6D Day 3 — pass apifyToken для PDF wedo path. Якщо
        // restaurant has PDF menu, wedo extracts dishes via OCR (~$0.10).
        // Якщо UpMenu iframe detected — result.source='upmenu_blocked',
        // dishes=[] (caller fallbacks до GMaps popular dishes).
        const result = await extractMenuFromWebsite(
          websiteUrl,
          params.anthropic_api_key,
          params.apify_api_token,
        )
        // Sprint S6D Day 3 — source reflects extraction path для UI
        // transparency. 'www_menu' для static_html_ai, 'wedo_pdf_menu'
        // для pdf_wedo, 'www_menu_blocked' для upmenu_blocked.
        // Sprint S-MENU Day 2 (15.05.2026) — added 'restaumatic_menu' branch
        // для new JSON-LD fast path (zero AI cost). enrichment_log буде
        // показувати source='restaumatic_menu' замість generic 'www_menu',
        // що дозволяє track impact Restaumatic-driven extractions.
        const dbSource =
          result.source === 'restaumatic_jsonld'
            ? 'restaumatic_menu'
            : result.source === 'pdf_wedo'
              ? 'wedo_pdf_menu'
              : result.source === 'upmenu_blocked'
                ? 'www_menu_blocked'
                : 'www_menu'
        await supabase.from('contact_enrichment').upsert(
          {
            target_type: 'client',
            target_id: clientId,
            source: dbSource,
            website: websiteUrl,
            raw_payload: {
              matched_path: result.matched_path,
              content_type: result.content_type,
              extraction_source: result.source,
              dishes: result.dishes,
              pages_fetched: result.pages_fetched,
            },
            status: result.dishes.length > 0 ? 'success' : 'partial',
            error_message: result.error ?? null,
            cost_usd: result.cost_usd,
            enriched_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
          },
          { onConflict: 'target_type,target_id,source' },
        )
        response.sources_completed.push({
          source: dbSource,
          status: result.dishes.length > 0 ? 'success' : 'partial',
          note: `${result.dishes.length} dań via ${result.source} (${result.matched_path ?? 'no match'}), $${result.cost_usd.toFixed(4)}`,
        })
        // Sprint S-MENU Day 3.2 (15.05.2026) — update enrichment_log row
        // source from initial 'www_menu' placeholder до actual dbSource
        // ('restaumatic_menu' / 'wedo_pdf_menu' / 'www_menu_blocked' / 'www_menu').
        // Audit trail тепер reflects ACTUAL extraction path. Wrapped у try-catch
        // — update failure NOT thrown (primary path вже succeeded).
        if (dbSource !== 'www_menu') {
          try {
            await supabase
              .from('enrichment_log')
              .update({ source: dbSource })
              .eq('id', wwwRunId)
          } catch (auditErr) {
            console.warn('[www_menu] audit log source update failed:', auditErr)
          }
        }
        await finishEnrichmentRun(supabase, wwwRunId, {
          status: result.dishes.length > 0 ? 'success' : 'partial',
          raw_payload: result,
          cost_usd: result.cost_usd,
          error_message: result.error,
        })
        // Sprint TYDZIEN1.A.2 — accumulate www_menu cost dla budget guard
        budgetCtx.addCost(result.cost_usd)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        response.errors.push(`www_menu: ${msg}`)
        response.sources_completed.push({ source: 'www_menu', status: 'error', error: msg })
        await finishEnrichmentRun(supabase, wwwRunId, { status: 'error', error_message: msg })
      }
    } else {
      // Sprint TYDZIEN1.A.2 — note differentiates budget_exceeded vs other skip reasons
      const skipNote =
        !websiteUrl
          ? 'no website URL (run Apify GMaps first)'
          : !params.anthropic_api_key
            ? 'anthropic_api_key missing'
            : `budget_exceeded: cumulative $${budgetCtx.getCumulative().toFixed(4)} >= $${budgetCtx.budgetUsd.toFixed(4)}`
      response.sources_completed.push({
        source: 'www_menu',
        status: 'skipped',
        note: skipNote,
      })
    }

    // STEP 5.5b — DEPRECATED Pyszne (kept як skipped marker для UI)
    response.sources_completed.push({
      source: 'pyszne_menu',
      status: 'skipped',
      note: 'DEPRECATED: no PL actor у Apify Store',
    })

    // STEP 5.5c — Wolt (fallback якщо restaurant on Wolt platform)
    const woltRunId = await startEnrichmentRun(supabase, {
      target_type: 'company',
      target_id: clientId,
      source: 'wolt_menu',
    })
    try {
      const result = await enrichMenuWolt(params.apify_api_token, {
        name: clientGateRow.title,
        city: clientGateRow.city,
      })
      await supabase.from('contact_enrichment').upsert(
        {
          target_type: 'client',
          target_id: clientId,
          source: 'wolt_menu',
          website: result.wolt_url,
          gmaps_rating: result.rating,
          raw_payload: {
            restaurant_name: result.restaurant_name,
            dishes: result.dishes,
            rating: result.rating,
            apify_raw: result.raw_payload,
          },
          status: result.status,
          error_message: result.error_message ?? null,
          cost_usd: result.cost_usd,
          enriched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        },
        { onConflict: 'target_type,target_id,source' },
      )
      response.sources_completed.push({
        source: 'wolt_menu',
        status: result.status === 'success' ? 'success' : 'partial',
        note: `${result.dishes.length} dań, $${result.cost_usd.toFixed(4)}`,
      })
      await finishEnrichmentRun(supabase, woltRunId, {
        status: result.status === 'success' ? 'success' : 'partial',
        raw_payload: result.raw_payload,
        cost_usd: result.cost_usd,
        error_message: result.error_message,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      response.errors.push(`Wolt: ${msg}`)
      response.sources_completed.push({ source: 'wolt_menu', status: 'error', error: msg })
      await finishEnrichmentRun(supabase, woltRunId, { status: 'error', error_message: msg })
    }
  } else {
    const note = !params.apify_api_token
      ? 'apify_api_token missing'
      : !isGastronomia
        ? `client_type=${clientType ?? '(unknown)'} — не gastronomia`
        : 'no client metadata'
    response.sources_completed.push({
      source: 'www_menu',
      status: 'skipped',
      note,
    })
    response.sources_completed.push({
      source: 'pyszne_menu',
      status: 'skipped',
      note: 'DEPRECATED: no PL actor у Apify Store',
    })
    response.sources_completed.push({
      source: 'wolt_menu',
      status: 'skipped',
      note,
    })
  }

  // ─── STEP 5.6: KRS fullnames deanonymization ───
  // Trigger якщо: (a) client_type у hurtownia/sklep_detal/sieci_handlowe AND
  //               (b) існує хоча б 1 anonymized person у DB.
  // Бо even gastronomia може mати anonymized PREZES — але scope обмежено
  // ціллю Vadym v5 spec до B2B-types.
  if (params.apify_api_token && isHurtowniaLike) {
    // Check для anonymized persons на цьому клієнті.
    const { data: anonPersons } = await supabase
      .from('person_company_links')
      .select('id, person_id, rola, persons:persons!inner(imie, nazwisko)')
      .eq('client_id', clientId)
      .is('data_do', null)
    type LinkRow = {
      id: string
      person_id: string
      rola: string
      persons:
        | { imie: string; nazwisko: string }
        | { imie: string; nazwisko: string }[]
        | null
    }
    const linkRows = ((anonPersons ?? []) as unknown) as LinkRow[]
    const anonLinks = linkRows.filter((l) => {
      const p = Array.isArray(l.persons) ? l.persons[0] : l.persons
      return p && isAnonymizedPerson(p.imie, p.nazwisko)
    })

    if (anonLinks.length === 0) {
      response.sources_completed.push({
        source: 'regdata_krs_fullnames',
        status: 'skipped',
        note: 'no anonymized persons (zarząd uже з real names)',
      })
    } else {
      const krsRunId = await startEnrichmentRun(supabase, {
        target_type: 'company',
        target_id: clientId,
        source: 'regdata_krs_fullnames',
      })
      try {
        const result = await enrichKrsFullnames(params.apify_api_token, {
          nip,
          krs: krsNumber,
        })
        let updated = 0
        if (result.status === 'success' && result.persons.length > 0) {
          // Match anonymized person by role → update names. Conservative:
          // якщо exactly 1 actor person matches role, AND exactly 1 anon
          // у DB має тот же role → swap.
          for (const anon of anonLinks) {
            const anonRole = anon.rola.toUpperCase().trim()
            const actorMatches = result.persons.filter(
              (p) => p.rola.toUpperCase().trim() === anonRole,
            )
            if (actorMatches.length === 1) {
              const real = actorMatches[0]
              if (real.imie && real.nazwisko) {
                const { error } = await supabase
                  .from('persons')
                  .update({
                    imie: real.imie,
                    nazwisko: real.nazwisko,
                    source: 'regdata_krs_fullnames',
                  })
                  .eq('id', anon.person_id)
                if (!error) updated += 1
              }
            }
          }
        }
        // Audit trail row у contact_enrichment
        await supabase.from('contact_enrichment').upsert(
          {
            target_type: 'client',
            target_id: clientId,
            source: 'regdata_krs_fullnames',
            raw_payload: {
              actor_persons: result.persons,
              anon_links_count: anonLinks.length,
              persons_updated: updated,
              apify_raw: result.raw_payload,
            },
            status: result.status,
            error_message: result.error_message ?? null,
            cost_usd: result.cost_usd,
            enriched_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
          },
          { onConflict: 'target_type,target_id,source' },
        )
        response.sources_completed.push({
          source: 'regdata_krs_fullnames',
          status: updated > 0 ? 'success' : 'partial',
          note: `${updated}/${anonLinks.length} persons deanonymized, $${result.cost_usd.toFixed(4)}`,
        })
        await finishEnrichmentRun(supabase, krsRunId, {
          status: updated > 0 ? 'success' : 'partial',
          raw_payload: { ...(result.raw_payload as object), persons_updated: updated },
          cost_usd: result.cost_usd,
          error_message: result.error_message,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        response.errors.push(`krs-fullnames: ${msg}`)
        response.sources_completed.push({ source: 'regdata_krs_fullnames', status: 'error', error: msg })
        await finishEnrichmentRun(supabase, krsRunId, { status: 'error', error_message: msg })
      }
    }
  } else {
    response.sources_completed.push({
      source: 'regdata_krs_fullnames',
      status: 'skipped',
      note: !params.apify_api_token
        ? 'apify_api_token missing'
        : !isHurtowniaLike
          ? `client_type=${clientType ?? '(unknown)'} — не hurtownia/sklep`
          : 'gating skipped',
    })
  }
  } // end runDeferredMenuAndKrs (Sprint S-MENU Day 2 — invoked post STEP 6.5)

  // ─── STEP 6.4: CEIDG firma details (JDG only) ───
  // Sprint S-CEIDG-DETAILS Day 1 (15.05.2026) — closes JDG↔brand gap.
  // CEIDG `/firma/{uuid}` returns uprawnienia (koncesje) — `opis` field
  // often contains brand+kind+address (e.g. "BAR KEMER KEBAB UL. MAGICZNA 6
  // LOK.1A, 03-289 WARSZAWA"). Registry name "MARCIN BOROWY" hides це.
  // Extracted brand_aliases feed AI ctx + future GMaps fallback.
  //
  // Gated to entityType==='JDG' (sp.z o.o. mają KRS, rejestrio_v2 покриває).
  // Lazy resolve UUID: якщо clients.ceidg_id NULL → search by NIP → cache.
  // Runs BEFORE AI_business_analysis так щоб aliases у prompt context.
  if (entityType === 'JDG' && params.ceidg_api_key) {
    const ceidgRunId = await startEnrichmentRun(supabase, {
      target_type: 'company',
      target_id: clientId,
      source: 'CEIDG_details',
    })
    try {
      const result = await runCeidgDetailsStep(supabase, params.ceidg_api_key, clientId, nip)
      response.sources_completed.push({
        source: 'CEIDG_details',
        status: result.aliases_count > 0 ? 'success' : 'partial',
        fields_added: result.aliases_count,
        note:
          result.aliases_count > 0
            ? `${result.aliases_count} brand_aliases extracted z uprawnień`
            : 'no commercial uprawnienia (e.g. JDG без alcohol/event koncesji)',
      })
      await finishEnrichmentRun(supabase, ceidgRunId, {
        status: 'success',
        raw_payload: {
          aliases_count: result.aliases_count,
          uprawnienia_count: result.uprawnienia_count,
          uuid_was_cached: result.uuid_was_cached,
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      response.errors.push(`CEIDG_details: ${msg}`)
      response.sources_completed.push({ source: 'CEIDG_details', status: 'error', error: msg })
      await finishEnrichmentRun(supabase, ceidgRunId, { status: 'error', error_message: msg })
    }
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

  // ─── STEP 6.6: Brand-aware website discovery (Sprint S-MENU Day 3) ───
  // Якщо CEIDG step populated brand_aliases AND current company_profile_fields
  // [website] is missing OR aggregator (Tavily picked monitorfirm.pb.pl /
  // yelp.com — live MARCIN BOROWY audit 15.05.2026), запускаємо brand-aware
  // Tavily re-query targeted на real restaurant site. Якщо знаходимо domain
  // contains brand slug — upsert під source='tavily_brand' (priority 2,
  // wins over default tavily=1 but loses до manual_override=5).
  //
  // ВАЖЛИВО: runs PERSE deferred menu/krs (STEP 6.7) щоб website був correct
  // коли www_menu/Restaumatic extractor пробує fetch HTML.
  const brandSearchKey = params.tavily_api_key || process.env.TAVILY_API_KEY || ''
  if (brandSearchKey && clientId) {
    try {
      // Fresh fetch — brand_aliases written by CEIDG (STEP 6.4), bp by AI (6.5)
      const { data: brandClientRow } = await supabase
        .from('clients')
        .select('brand_aliases, business_profile, city')
        .eq('id', clientId)
        .maybeSingle()
      type BrandClientRow = {
        brand_aliases?: Array<{ brand: string; kind: string | null; address: string | null }> | null
        business_profile?: {
          client_type?: string
          client_subtype?: string
          // Sprint S-MENU Day 3.1.1 (15.05.2026) — AI-extracted brand fallback.
          extracted_brand?: string | null
          extracted_brand_confidence?: 'high' | 'medium' | 'low' | null
        } | null
        city?: string | null
      }
      const bcr = brandClientRow as BrandClientRow | null
      const brandAliases = Array.isArray(bcr?.brand_aliases) ? bcr.brand_aliases : []

      // Sprint S-MENU Day 3.1.1 — cascading brand lookup.
      // PRIMARY: CEIDG koncesja brand (high quality — alcohol license signal).
      // FALLBACK 1: Apify GMaps business_name (Sprint S-DISCOVERY.1, 16.05.2026)
      //   — Google verified business name, cleaned legal forms + city. Used коли
      //   CEIDG no koncesja (sushi, kawiarnia, etc. без alcohol license). Domek
      //   Sushi class: Apify title "Domek Sushi Piaseczno" → brand "Domek Sushi"
      //   → Tavily knows domeksushi.pl з slug boost 5 (Day 4.2 floor passes).
      // FALLBACK 2: AI-extracted brand from clients.title (covers remaining gap
      //   — gastronomy JDG без CEIDG + без Apify match). Confidence gate excludes
      //   'low' (surname false-positive guard).
      let primaryBrand: string | null = null
      let brandSource: 'ceidg_koncesja' | 'apify_gmaps' | 'ai_extracted' | 'none' = 'none'
      const ceidgBrand = brandAliases[0]?.brand
      if (ceidgBrand && ceidgBrand.trim().length > 0) {
        primaryBrand = ceidgBrand.trim()
        brandSource = 'ceidg_koncesja'
      } else if (apifyBusinessName && apifyBusinessName.trim().length > 0) {
        // Sprint S-DISCOVERY.1 — Apify GMaps title (gated на success+similarity)
        primaryBrand = apifyBusinessName.trim()
        brandSource = 'apify_gmaps'
      } else {
        const aiBrand = bcr?.business_profile?.extracted_brand
        const aiConf = bcr?.business_profile?.extracted_brand_confidence
        if (
          typeof aiBrand === 'string' &&
          aiBrand.trim().length > 0 &&
          (aiConf === 'high' || aiConf === 'medium')
        ) {
          primaryBrand = aiBrand.trim()
          brandSource = 'ai_extracted'
        }
      }

      // Current website з canonical (active row у company_profile_fields)
      const { data: currentWebField } = await supabase
        .from('company_profile_fields')
        .select('value_text, source')
        .eq('client_id', clientId)
        .eq('field_key', 'website')
        .is('superseded_at', null)
        .maybeSingle()
      const currentWebsite = (currentWebField as { value_text?: string | null } | null)?.value_text ?? null
      const currentSource = (currentWebField as { source?: string | null } | null)?.source ?? null
      const websiteIsAggregator = currentWebsite ? isAggregatorUrl(currentWebsite) : false
      const websiteIsManual = currentSource === 'manual_override' || currentSource === 'manual'

      // Gate: only fire якщо brand exists AND website is missing/aggregator AND NOT manual-set
      const shouldRun =
        primaryBrand !== null &&
        primaryBrand.trim().length > 0 &&
        !websiteIsManual &&
        (currentWebsite === null || websiteIsAggregator)

      if (shouldRun && primaryBrand) {
        // Sprint S-MENU Day 3.1 (15.05.2026) — city extraction з brand_aliases
        // address. CEIDG koncesja `opis` field містить "BAR KEMER KEBAB UL.
        // MAGICZNA 6 LOK.1A, 03-289 WARSZAWA" — postal code prefix "XX-XXX"
        // followed by city. clients.city = null for many JDG (GUS не populates),
        // тому brand_aliases.address є primary signal.
        let resolvedCity: string | null = bcr?.city ?? null
        if (!resolvedCity) {
          const addr = brandAliases[0]?.address
          if (addr) {
            const m = addr.match(/,\s*\d{2}-\d{3}\s+([A-ZŁŚŻŹĆĘŚŁĄÓŃ][A-ZŁŚŻŹĆĘŚŁĄÓŃ\s\-]+)/i)
            if (m && m[1]) {
              resolvedCity = m[1].trim().split(/\s{2,}/)[0]
            }
          }
        }
        const brandRunId = await startEnrichmentRun(supabase, {
          target_type: 'company',
          target_id: clientId,
          source: 'tavily_brand_search',
        })
        try {
          const result = await searchCompanyByBrand(primaryBrand, resolvedCity, brandSearchKey)
          if (result.status === 'success' && result.website_url) {
            await upsertFields(
              supabase,
              { type: 'client', id: clientId },
              [{ field_key: 'website', value: { value_text: result.website_url } }],
              'tavily_brand',
            )
            // Sprint S-MENU Day 3.1 — also mirror до clients.website canonical
            // column. Day 3 POST endpoint for manual_override did це; STEP 6.6
            // automation must matcch для consistency (UI/AI read both).
            try {
              await supabase
                .from('clients')
                .update({ website: result.website_url })
                .eq('id', clientId)
            } catch (mirrorErr) {
              console.warn('[STEP 6.6] clients.website mirror failed:', mirrorErr)
            }
            response.sources_completed.push({
              source: 'tavily_brand_search',
              status: 'success',
              note: `brand "${primaryBrand}" → ${result.website_url} (replaces ${websiteIsAggregator ? `aggregator ${currentWebsite}` : 'null'})`,
            })
            await finishEnrichmentRun(supabase, brandRunId, {
              status: 'success',
              raw_payload: {
                brand: primaryBrand,
                // Sprint S-MENU Day 3.1.1 — log brandSource ('ceidg_koncesja'
                // vs 'ai_extracted') для debug coverage analysis.
                brand_source: brandSource,
                // Sprint S-MENU Day 3.1 — log resolvedCity (fallback from
                // brand_aliases address regex), не just clients.city.
                city: resolvedCity,
                city_source: bcr?.city ? 'clients' : (resolvedCity ? 'brand_aliases_address' : 'none'),
                // Sprint S-MENU Day 3.1.3 — exact Tavily query string sent.
                // Replay-able без re-run, helps tune query format.
                query_sent: result.query_sent,
                website_url: result.website_url,
                candidates_considered: result.candidates_considered,
                replaced: currentWebsite,
              },
              cost_usd: result.search_cost_usd,
            })
          } else {
            response.sources_completed.push({
              source: 'tavily_brand_search',
              status: result.status,
              note: result.error ?? 'no brand-matching website found',
            })
            await finishEnrichmentRun(supabase, brandRunId, {
              status: result.status === 'error' ? 'error' : 'partial',
              raw_payload: {
                brand: primaryBrand,
                // Sprint S-MENU Day 3.1.1 — log brandSource у partial branch теж.
                brand_source: brandSource,
                // Sprint S-MENU Day 3.1.3 (15.05.2026) — extended debug у partial
                // branch. Critical для diagnosing 0-results cases (e.g. Fortuna
                // 19:14 з old `site:.pl` query). Now includes resolved city +
                // exact Tavily query string sent — Vadym/Cowork can replay
                // queries directly without re-running lookup.
                city: resolvedCity,
                city_source: bcr?.city ? 'clients' : (resolvedCity ? 'brand_aliases_address' : 'none'),
                query_sent: result.query_sent,
                candidates_considered: result.candidates_considered,
                // Sprint S-MENU Day 4.2 (16.05.2026) — top 3 non-aggregator
                // candidates з brand_slug_boost breakdown. Visible коли floor
                // rejection (boost=0) — explains чому brand search failed.
                // PJ Rawa example: znanylekarz.pl tavily=0.85 boost=0 → rejected.
                top_candidates: result.top_candidates ?? null,
              },
              // Sprint S-MENU Day 3 TSC fix: BrandSearchResult.error is
              // `string | null`, finishEnrichmentRun expects `string | undefined`.
              error_message: result.error ?? undefined,
              cost_usd: result.search_cost_usd,
            })
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          response.errors.push(`tavily_brand_search: ${msg}`)
          await finishEnrichmentRun(supabase, brandRunId, { status: 'error', error_message: msg })
        }
      } else {
        // Sprint S-MENU Day 3.1.1 — skip reason now reflects both brand sources
        // (CEIDG koncesja + AI extracted_brand). Empty means BOTH failed.
        // Sprint S-DISCOVERY.1 (16.05.2026) — also mentions Apify (3rd source).
        const aiBrand = bcr?.business_profile?.extracted_brand
        const aiConf = bcr?.business_profile?.extracted_brand_confidence
        const aiBrandLow = typeof aiBrand === 'string' && aiBrand.trim().length > 0 && aiConf === 'low'
        const skipReason = !primaryBrand
          ? aiBrandLow
            ? `AI extracted_brand="${aiBrand}" but confidence=low (treated as surname/generic); CEIDG empty; Apify business_name empty`
            : 'brand_aliases empty (CEIDG no koncesja) AND Apify business_name=null AND AI extracted_brand=null'
          : websiteIsManual
            ? `website set manually (source=${currentSource})`
            : currentWebsite && !websiteIsAggregator
              ? `website already non-aggregator (${currentWebsite})`
              : 'gate skipped'
        response.sources_completed.push({
          source: 'tavily_brand_search',
          status: 'skipped',
          note: skipReason,
        })
      }
    } catch (err) {
      console.error('[PhaseB] tavily_brand_search outer failed:', err)
    }
  }

  // ─── STEP 6.7: deferred menu + KRS-fullnames (Sprint S-MENU Day 2 fix) ───
  // Gates `isGastronomia`/`isHurtowniaLike` read FRESH business_profile.client_type
  // (just written by AI у STEP 6.5). Wraps existing 5.5/5.6 logic як closure
  // defined ~line 731. JDG gastronomy clients (CEIDG-classified) тепер catch
  // www_menu/Wolt/Restaumatic menu extraction. Hurtownia clients catch
  // krs-fullnames deanonymization correctly. Try/catch protects STEP 6/7
  // from any closure-throw.
  try {
    await runDeferredMenuAndKrs()
  } catch (err) {
    console.error('[PhaseB] runDeferredMenuAndKrs failed:', err)
    response.errors.push(
      `deferred menu/krs: ${err instanceof Error ? err.message : String(err)}`,
    )
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
  /** Sprint TYDZIEN1.A.2 HOTFIX (27.05.2026) — per-firm budget ctx (z runPhaseB). */
  budgetCtx: LookupBudgetCtx,
): Promise<void> {
  // Sprint S-RANK Bonus (13.05.2026) — cache guard для rejestr.io API.
  // ROI audit виявив: 12.05 → 19 з 24 rejestrio_v2 calls = duplicate
  // re-enrich на clients що вже мали krs_management_board у DB + recent
  // successful enrichment. Це wasted 30% з 50 zł credit (~15 zł / 3 dni).
  //
  // Skip rejestrio_v2 IF:
  //   1. clients.krs_management_board JSONB populated (НЕ NULL і НЕ '[]')
  //   AND
  //   2. enrichment_log має status='success' для (target_id=clientId,
  //      source='rejestrio_v2') у last 30 days
  //
  // ELSE fire fresh call (stale OR empty cache).
  const { data: clientRow } = await supabase
    .from('clients')
    .select('krs_management_board')
    .eq('id', clientId)
    .maybeSingle()
  const mgmtBoard = (clientRow as { krs_management_board: unknown } | null)
    ?.krs_management_board
  const hasMgmt =
    mgmtBoard !== null &&
    mgmtBoard !== undefined &&
    Array.isArray(mgmtBoard) &&
    mgmtBoard.length > 0

  if (hasMgmt) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await supabase
      .from('enrichment_log')
      .select('id, run_started_at')
      .eq('target_id', clientId)
      .eq('target_type', 'company')
      .eq('source', 'rejestrio_v2')
      .eq('status', 'success')
      .gte('run_started_at', cutoff)
      .order('run_started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (recent) {
      const lastRun = (recent as { run_started_at: string }).run_started_at
      console.log(
        `[lookup] rejestrio_v2 SKIP cached (<30d) clientId=${clientId} krs=${krsNumber} lastRun=${lastRun}`,
      )
      response.sources_completed.push({
        source: 'rejestrio_v2',
        status: 'skipped',
        note: `cached: krs_management_board populated, last success ${lastRun.slice(0, 10)} (<30d)`,
      })
      // НЕ створюємо новий enrichment_log entry — це skipping, no API call.
      return
    }
  }

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

    // Sprint TYDZIEN1.A.1.2 (27.05.2026) — DEDUPE: after successful rejestrio_v2
    // upsert, remove krs_anon placeholders dla (client_id, rola) pairs gdzie
    // mamy real rejestrio_v2 link. Preserves anon як fallback jeśli rejestrio
    // step failed (no upsert → no cleanup).
    if (personsUpserted > 0) {
      // Step 1: delete anon person_company_links where rejestrio_v2 link exists
      // dla tego samego (client_id, rola). Two-pass (fetch ids → delete) bo
      // PostgREST nie wspiera EXISTS subqueries z policy enforcement.
      const { data: anonLinks } = await supabase
        .from('person_company_links')
        .select('id, person_id, rola, persons!inner(id, source, imie)')
        .eq('client_id', clientId)
      const anonRowIds = (anonLinks ?? [])
        .filter((row: any) => {
          const p = Array.isArray(row.persons) ? row.persons[0] : row.persons
          if (!p) return false
          const isAnon =
            p.source === 'krs_anon' ||
            p.source === null ||
            (typeof p.imie === 'string' && p.imie.startsWith('(KRS'))
          if (!isAnon) return false
          // Also has rejestrio_v2 link з same rola?
          return (anonLinks ?? []).some((r2: any) => {
            const p2 = Array.isArray(r2.persons) ? r2.persons[0] : r2.persons
            return (
              r2.id !== row.id &&
              r2.rola === row.rola &&
              p2 &&
              p2.source === 'rejestrio_v2'
            )
          })
        })
        .map((r: any) => ({ link_id: r.id as string, person_id: r.person_id as string }))

      if (anonRowIds.length > 0) {
        const linkIdsToDelete = anonRowIds.map((r) => r.link_id)
        const { error: delLinkErr } = await supabase
          .from('person_company_links')
          .delete()
          .in('id', linkIdsToDelete)
        if (delLinkErr) {
          console.warn('[lookup] dedupe: delete anon links failed', delLinkErr.message)
        }
        // Step 2: delete orphaned anon persons (no remaining links)
        const personIdsToCheck = [...new Set(anonRowIds.map((r) => r.person_id))]
        let orphansDeleted = 0
        for (const personId of personIdsToCheck) {
          const { data: remaining } = await supabase
            .from('person_company_links')
            .select('id')
            .eq('person_id', personId)
            .limit(1)
          if (!remaining || remaining.length === 0) {
            const { error: delPersonErr } = await supabase
              .from('persons')
              .delete()
              .eq('id', personId)
            if (!delPersonErr) orphansDeleted += 1
          }
        }
        console.log(
          `[lookup] dedupe anon: clientId=${clientId} deletedLinks=${linkIdsToDelete.length} orphans=${orphansDeleted}`,
        )
        summary.anon_links_deduped = linkIdsToDelete.length
        summary.anon_orphans_deleted = orphansDeleted
      }
    }
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
    //
    // Sprint TYDZIEN1.A.2 (27.05.2026) — ENV gate REJESTRIO_FETCH_JSON_FINANCIALS.
    // Default skip (process.env.REJESTRIO_FETCH_JSON_FINANCIALS !== 'true').
    // JSON XBRL fetch = 0,50 zł × 2 (RZiS + Bilans) × N years per firma (typically
    // 1-3 zł / firma) — drains rejestr.io credit fast. Sztab nie processes XBRL
    // raw data downstream (no analytics). Enable opt-in via ENV=true для Premium
    // plan або kiedy explicitly potrzebne finanse.
    const SKIP_FINANCIALS = process.env.REJESTRIO_FETCH_JSON_FINANCIALS !== 'true'
    const BUDGET_OK_FINANCIALS = budgetCtx.checkBudget('sprawozdania_json')
    if (SKIP_FINANCIALS) {
      summary.financial_years = 0
      // Sprint TYDZIEN1.A.2 HOTFIX — summary is Record<string,number>, use numeric flag.
      // Reason text is in console.log + enrichment_log audit (sprawozdania_json_disabled_env).
      summary.financial_skipped_env = 1
      console.log(
        `[lookup] sprawozdania SKIP env_flag clientId=${clientId} krs=${krs} (REJESTRIO_FETCH_JSON_FINANCIALS != 'true')`,
      )
    } else if (!BUDGET_OK_FINANCIALS) {
      summary.financial_years = 0
      // Sprint TYDZIEN1.A.2 HOTFIX — numeric flag (см. wyżej). budgetCtx already logged via checkBudget().
      summary.financial_skipped_budget = 1
    } else {
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
    }
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

// ─── Sprint S-CEIDG-DETAILS Day 1 — CEIDG firma details helper ───
// Lazy resolves clients.ceidg_id (cache miss → CEIDG /firmy?nip= search →
// pick firmy[0].id → UPDATE clients.ceidg_id). Then fetches /firma/{uuid}
// → extracts uprawnienia → BrandAlias[] → UPDATE clients.brand_aliases.
//
// Returns aliases_count + uprawnienia_count + uuid_was_cached для telemetry.
// Throws на CEIDG search miss / API error — caller traps та logs.
async function runCeidgDetailsStep(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ceidgApiKey: string,
  clientId: string,
  nip: string,
): Promise<{ aliases_count: number; uprawnienia_count: number; uuid_was_cached: boolean }> {
  const ceidgClient = new CeidgClient(ceidgApiKey)

  // ─── Step 1 — resolve UUID (cache lookup) ───
  const { data: clientRow } = await supabase
    .from('clients')
    .select('ceidg_id')
    .eq('id', clientId)
    .maybeSingle()
  let ceidgId = (clientRow as { ceidg_id: string | null } | null)?.ceidg_id ?? null
  const uuidWasCached = !!ceidgId

  // Cache miss → CEIDG search by NIP, pick firmy[0].id, persist
  if (!ceidgId) {
    const searchRes = await ceidgClient.listFirms({ nip }, 0, 2)
    const firmy = searchRes.firmy ?? []
    if (firmy.length === 0) {
      throw new Error(`CEIDG search returned 0 firms для NIP=${nip}`)
    }
    ceidgId = firmy[0].id
    if (!ceidgId) {
      throw new Error('CEIDG search firmy[0].id missing у response')
    }
    await supabase.from('clients').update({ ceidg_id: ceidgId }).eq('id', clientId)
  }

  // ─── Step 2 — fetch firma details + extract aliases ───
  const details = await ceidgClient.getFirmDetails(ceidgId)
  if (!details) {
    throw new Error(`CEIDG getFirmDetails returned null для UUID=${ceidgId}`)
  }
  const uprawnienia = details.uprawnienia ?? []
  const aliases = extractBrandAliasesFromKoncesje(uprawnienia)

  // ─── Step 3 — persist brand_aliases (тільки коли non-empty, щоб не overwrite
  // майбутні sources — Day 2 GMaps/website appender) ───
  if (aliases.length > 0) {
    await supabase
      .from('clients')
      .update({ brand_aliases: aliases })
      .eq('id', clientId)
  }

  return {
    aliases_count: aliases.length,
    uprawnienia_count: uprawnienia.length,
    uuid_was_cached: uuidWasCached,
  }
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
