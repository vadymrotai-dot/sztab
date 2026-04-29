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

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrichWithVAT, normalizeNip, isValidNip } from '@/lib/enrichment/vat'
import { enrichWithGUS, gusLogin } from '@/lib/enrichment/gus'
import { enrichWithKRS } from '@/lib/enrichment/krs'
import { searchBzpByWinnerNip } from '@/lib/enrichment/bzp'
import { fetchSprawozdania } from '@/lib/enrichment/krs-financials'
import { fetchMsigChanges } from '@/lib/enrichment/msig'
import { extractFromWebsite } from '@/lib/enrichment/website'
import { upsertField, upsertFields } from '@/lib/profile/merge'
import { findExistingContact } from '@/lib/enrichment/contact-preflight'
import { enrichContactsApify } from '@/lib/enrichment/apify'
import { searchCompanyOnline } from '@/lib/enrichment/web-search'
import { startEnrichmentRun, finishEnrichmentRun } from '@/lib/profile/enrichment-log'
import { computeMatchesForClient } from '@/lib/matching/engine'

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
    .select('anthropic_api_key, gus_api_key, apify_api_token, krs_rejestr_api_token')
    .limit(1)
    .maybeSingle()
  const params = (paramsRow ?? {}) as {
    anthropic_api_key?: string
    gus_api_key?: string
    apify_api_token?: string
    krs_rejestr_api_token?: string
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
        // Mirror GUS data back to clients table (legacy compat)
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

  // 1b. KRS lookup (если sp.z o.o./S.A. з extracted krs_number)
  if (krsNumber && (entityType === 'sp.z o.o.' || entityType === 'S.A.' || entityType === 'inne')) {
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

  // ─── STEP 3: Buying signals (BZP + sprawozdania + MSiG, parallel) ───
  await Promise.allSettled([
    runBzpStep(supabase, clientId, nip, response),
    krsNumber
      ? runSprawozdaniaStep(supabase, clientId, krsNumber, params.krs_rejestr_api_token, response)
      : Promise.resolve(),
    krsNumber
      ? runMsigStep(supabase, clientId, krsNumber, params.krs_rejestr_api_token, response)
      : Promise.resolve(),
  ])

  // ─── STEP 4: People extraction ───
  const personsCreated = await extractAndCreatePersons(
    supabase,
    clientId,
    entityType,
    krsNumber,
    response,
    params.anthropic_api_key,
  )
  response.persons_created = personsCreated

  // ─── STEP 4.5: Online presence (Tavily web search) ───
  // Sprint L Phase 2 — find website / Facebook / Instagram / news mentions.
  const tavilyKey = process.env.TAVILY_API_KEY ?? ''
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
      note: 'TAVILY_API_KEY missing у env',
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

  // ─── STEP 6: Sztab match intelligence ───
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
    } else {
      response.sources_completed.push({ source: 'matching', status: 'error', error: r.error })
    }
  } catch (err) {
    response.sources_completed.push({ source: 'matching', status: 'error', error: err instanceof Error ? err.message : String(err) })
  }

  return NextResponse.json({ ok: true, response })
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
    let inserted = 0
    for (const n of notices) {
      const { error } = await supabase.from('bzp_tenders').upsert(
        {
          bzp_notice_id: n.noticeId,
          client_id: clientId,
          winner_nip: n.winner?.nip ?? nip,
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

async function runSprawozdaniaStep(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  krsNumber: string,
  apiKey: string | undefined,
  response: LookupResponse,
): Promise<void> {
  const runId = await startEnrichmentRun(supabase, {
    target_type: 'company',
    target_id: clientId,
    source: 'sprawozdania_KRS',
  })
  try {
    if (!apiKey) {
      response.sources_completed.push({ source: 'sprawozdania_KRS', status: 'skipped', note: 'no rejestr.io token' })
      await finishEnrichmentRun(supabase, runId, { status: 'partial', error_message: 'no API key' })
      return
    }
    const sprawozdania = await fetchSprawozdania(apiKey, { krs: krsNumber })
    let inserted = 0
    for (const s of sprawozdania) {
      const { error } = await supabase.from('company_financials').upsert(
        {
          client_id: clientId,
          rok: s.rok,
          przychody_pln: s.przychody_pln,
          zysk_netto_pln: s.zysk_netto_pln,
          marza_netto: s.marza_netto,
          aktywa_pln: s.aktywa_pln,
          kapital_wlasny_pln: s.kapital_wlasny_pln,
          zatrudnienie: s.zatrudnienie,
          source_url: s.source_url,
          filed_at: s.filed_at,
          raw_payload: s.raw,
        },
        { onConflict: 'client_id,rok' },
      )
      if (!error) inserted++
    }
    response.sources_completed.push({
      source: 'sprawozdania_KRS',
      status: sprawozdania.length > 0 ? 'success' : 'partial',
      fields_added: inserted,
      note: `${sprawozdania.length} years (${inserted} stored)`,
    })
    await finishEnrichmentRun(supabase, runId, {
      status: 'success',
      raw_payload: { years: sprawozdania.length },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    response.errors.push(`sprawozdania: ${msg}`)
    response.sources_completed.push({ source: 'sprawozdania_KRS', status: 'error', error: msg })
    await finishEnrichmentRun(supabase, runId, { status: 'error', error_message: msg })
  }
}

async function runMsigStep(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  krsNumber: string,
  apiKey: string | undefined,
  response: LookupResponse,
): Promise<void> {
  const runId = await startEnrichmentRun(supabase, {
    target_type: 'company',
    target_id: clientId,
    source: 'MSiG',
  })
  try {
    if (!apiKey) {
      response.sources_completed.push({ source: 'MSiG', status: 'skipped', note: 'no rejestr.io token' })
      await finishEnrichmentRun(supabase, runId, { status: 'partial', error_message: 'no API key' })
      return
    }
    const changes = await fetchMsigChanges(apiKey, { krs: krsNumber })
    let inserted = 0
    for (const c of changes) {
      const { error } = await supabase.from('msig_changes').insert({
        client_id: clientId,
        msig_number: c.msig_number,
        publication_date: c.publication_date,
        change_type: c.change_type,
        description: c.description,
        raw_payload: c.raw,
      })
      if (!error) inserted++
    }
    response.sources_completed.push({
      source: 'MSiG',
      status: changes.length > 0 ? 'success' : 'partial',
      fields_added: inserted,
      note: `${changes.length} changes (${inserted} stored)`,
    })
    await finishEnrichmentRun(supabase, runId, {
      status: 'success',
      raw_payload: { changes: changes.length },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    response.errors.push(`MSiG: ${msg}`)
    response.sources_completed.push({ source: 'MSiG', status: 'error', error: msg })
    await finishEnrichmentRun(supabase, runId, { status: 'error', error_message: msg })
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

  // From KRS zarząd (already stored у company_profile_fields.krs_management_board)
  const { data: boardField } = await supabase
    .from('company_profile_fields')
    .select('value_json')
    .eq('client_id', clientId)
    .eq('field_key', 'krs_management_board')
    .is('superseded_at', null)
    .maybeSingle()
  const board =
    (boardField as { value_json: Array<{ name?: string; surname?: string; functionName?: string; funkcjaWOrganie?: string }> } | null)
      ?.value_json
  if (Array.isArray(board)) {
    for (const member of board) {
      const fullName = [member.name, member.surname].filter(Boolean).join(' ')
      if (!fullName) continue
      const parts = fullName.split(/\s+/)
      const imie = parts[0] ?? ''
      const nazwisko = parts.slice(1).join(' ') || '?'
      const rola = member.funkcjaWOrganie ?? member.functionName ?? 'Członek Zarządu'

      // Dedup by (imie, nazwisko, link на цей client)
      const { data: existingLink } = await supabase
        .from('person_company_links')
        .select('id, person_id, persons!inner(imie, nazwisko)')
        .eq('client_id', clientId)
        .ilike('rola', rola)
        .limit(1)
      if (existingLink && existingLink.length > 0) continue

      // Insert person + link
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
          jest_decyzyjny: rola.toLowerCase().includes('prezes') || rola.toLowerCase().includes('zarząd'),
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
