// lib/enrichment/apify-batch.ts
// Sprint H — bulk Apify enrichment з NIP dedup pre-pass.
//
// Strategy (Path B per Vadym):
//   1. Build TOP-N candidate set FILTERED by combined_score, DEDUPED by NIP.
//      DISTINCT ON (nip) — pick highest-scoring match per NIP.
//   2. For each unique NIP — single Apify call.
//   3. Write-back: для kожного target_id (client_id або prospect_id) у
//      candidate pool that shares this NIP, INSERT/UPSERT row у contact_enrichment.
//      Same NIP can have BOTH client and prospect rows → 2 rows, identical payload.
//   4. NIP NULL → skip з reason="no_nip".
//
// Cost guard: estimated $/Apify call ≈ $0.021 max (3 results). 50 unique NIPs
// → ~$1.05 max. Budget = $5 default; configurable via param.

import type { SupabaseClient } from '@supabase/supabase-js'
import { enrichContactsApify, type ApifyEnrichResult } from './apify'

const COST_BUDGET_USD_DEFAULT = 5.0
const COST_PER_NIP_ESTIMATE = 0.021 // worst case 3 results

export interface ApifyBatchOptions {
  source: 'clients' | 'prospects' | 'mixed'
  min_combined_score: number
  limit: number
  budget_usd?: number
  dry_run?: boolean
}

export interface ApifyBatchPlanItem {
  nip: string
  name: string
  city: string | null
  target_ids: Array<{ target_type: 'client' | 'prospect'; target_id: string }>
  best_combined_score: number
}

export interface ApifyBatchPlan {
  unique_nips: number
  total_target_rows: number
  estimated_cost_usd: number
  items: ApifyBatchPlanItem[]
  skipped_no_nip: number
}

export interface ApifyBatchSummary {
  unique_nips_attempted: number
  rows_inserted: number
  successful_nips: number
  partial_nips: number
  no_match_nips: number
  error_nips: number
  total_cost_usd: number
  duration_ms: number
  per_nip: Array<{
    nip: string
    name: string
    status: ApifyEnrichResult['status']
    targets_written: number
    cost_usd: number
    error?: string
  }>
}

interface CandidateRow {
  match_id: string
  combined_score: number
  product_id: string
  client_id: string | null
  prospect_id: string | null
  nip: string | null
  name: string | null
  city: string | null
  target_type: 'client' | 'prospect'
  target_id: string
}

/**
 * Build dedup plan via raw SQL — simpler ніж множинні JS-side joins.
 */
export async function buildBatchPlan(
  supabase: SupabaseClient,
  opts: ApifyBatchOptions,
): Promise<ApifyBatchPlan> {
  // Pull all candidates passing score gate, then dedup app-side.
  // Supabase JS не supports DISTINCT ON, тому join + group в коде.
  const minScore = opts.min_combined_score
  const safeLimit = Math.max(1, Math.min(opts.limit ?? 50, 200))

  // Pull score-ordered match rows з denormalized target info.
  // Sprint I: filter by apify_review_status='approved'.
  // Sprint J: also require is_primary_for_target=true (one row per унікальна
  // firma; downstream NIP dedup залишається як safety net).
  const { data: matchRows, error: mErr } = await supabase
    .from('matches')
    .select(
      'id, combined_score, product_id, client_id, prospect_id, apify_review_status, is_primary_for_target',
    )
    .gte('combined_score', minScore)
    .eq('apify_review_status', 'approved')
    .eq('is_primary_for_target', true)
    .order('combined_score', { ascending: false })
    .limit(safeLimit * 6) // fetch wider pool, then dedup by NIP
  if (mErr) throw new Error(`build plan: ${mErr.message}`)
  const matches = (matchRows ?? []) as Array<{
    id: string
    combined_score: number
    product_id: string
    client_id: string | null
    prospect_id: string | null
  }>

  if (matches.length === 0) {
    return {
      unique_nips: 0,
      total_target_rows: 0,
      estimated_cost_usd: 0,
      items: [],
      skipped_no_nip: 0,
    }
  }

  // Filter by source param
  const filtered = matches.filter((m) => {
    if (opts.source === 'clients') return m.client_id !== null
    if (opts.source === 'prospects') return m.prospect_id !== null
    return true
  })

  const clientIds = Array.from(
    new Set(filtered.filter((m) => m.client_id).map((m) => m.client_id as string)),
  )
  const prospectIds = Array.from(
    new Set(filtered.filter((m) => m.prospect_id).map((m) => m.prospect_id as string)),
  )

  const [clientsRes, prospectsRes] = await Promise.all([
    clientIds.length > 0
      ? supabase
          .from('clients')
          .select('id, title, nip, city, region')
          .in('id', clientIds)
      : Promise.resolve({ data: [] }),
    prospectIds.length > 0
      ? supabase
          .from('ceidg_prospects')
          .select('id, name, nip, miejscowosc, wojewodztwo')
          .in('id', prospectIds)
      : Promise.resolve({ data: [] }),
  ])
  const clientMap = new Map<string, { id: string; title: string; nip: string | null; city: string | null }>(
    ((clientsRes.data ?? []) as Array<{
      id: string
      title: string
      nip: string | null
      city: string | null
      region: string | null
    }>).map((c) => [c.id, { id: c.id, title: c.title, nip: c.nip, city: c.city ?? c.region }]),
  )
  const prospectMap = new Map<string, { id: string; name: string; nip: string | null; city: string | null }>(
    ((prospectsRes.data ?? []) as Array<{
      id: string
      name: string
      nip: string | null
      miejscowosc: string | null
      wojewodztwo: string | null
    }>).map((p) => [
      p.id,
      { id: p.id, name: p.name, nip: p.nip, city: p.miejscowosc ?? p.wojewodztwo },
    ]),
  )

  // Dedup by NIP — first occurrence (=highest score) wins. Track all
  // target_ids that share that NIP.
  const seenNips = new Map<string, ApifyBatchPlanItem>()
  let skippedNoNip = 0

  for (const m of filtered) {
    let cand: CandidateRow | null = null
    if (m.client_id) {
      const c = clientMap.get(m.client_id)
      if (!c) continue
      cand = {
        match_id: m.id,
        combined_score: m.combined_score,
        product_id: m.product_id,
        client_id: m.client_id,
        prospect_id: null,
        nip: c.nip,
        name: c.title,
        city: c.city,
        target_type: 'client',
        target_id: c.id,
      }
    } else if (m.prospect_id) {
      const p = prospectMap.get(m.prospect_id)
      if (!p) continue
      cand = {
        match_id: m.id,
        combined_score: m.combined_score,
        product_id: m.product_id,
        client_id: null,
        prospect_id: m.prospect_id,
        nip: p.nip,
        name: p.name,
        city: p.city,
        target_type: 'prospect',
        target_id: p.id,
      }
    }
    if (!cand) continue

    // Skip NULL/empty NIP
    if (!cand.nip || !cand.nip.replace(/\D/g, '')) {
      skippedNoNip++
      continue
    }

    const cleanNip = cand.nip.replace(/\D/g, '')
    let item = seenNips.get(cleanNip)
    if (!item) {
      // First time seen — pick this candidate's metadata
      item = {
        nip: cleanNip,
        name: cand.name ?? '',
        city: cand.city,
        target_ids: [],
        best_combined_score: cand.combined_score,
      }
      seenNips.set(cleanNip, item)
      if (seenNips.size > safeLimit) {
        seenNips.delete(cleanNip)
        break
      }
    }
    // Append target_id (deduped)
    if (
      !item.target_ids.some(
        (t) => t.target_type === cand.target_type && t.target_id === cand.target_id,
      )
    ) {
      item.target_ids.push({ target_type: cand.target_type, target_id: cand.target_id })
    }
  }

  const items = Array.from(seenNips.values()).slice(0, safeLimit)
  const totalRows = items.reduce((sum, it) => sum + it.target_ids.length, 0)
  const estimatedCost = Math.round(items.length * COST_PER_NIP_ESTIMATE * 10000) / 10000

  return {
    unique_nips: items.length,
    total_target_rows: totalRows,
    estimated_cost_usd: estimatedCost,
    items,
    skipped_no_nip: skippedNoNip,
  }
}

/** Execute batch — assumes plan already vetted by buildBatchPlan/budget guard. */
export async function executeBatch(
  supabase: SupabaseClient,
  apifyKey: string,
  plan: ApifyBatchPlan,
): Promise<ApifyBatchSummary> {
  const startedAt = Date.now()
  const summary: ApifyBatchSummary = {
    unique_nips_attempted: plan.items.length,
    rows_inserted: 0,
    successful_nips: 0,
    partial_nips: 0,
    no_match_nips: 0,
    error_nips: 0,
    total_cost_usd: 0,
    duration_ms: 0,
    per_nip: [],
  }

  for (const item of plan.items) {
    const r = await enrichContactsApify(apifyKey, {
      name: item.name,
      city: item.city,
      nip: item.nip,
    })

    summary.total_cost_usd += r.cost_usd

    // Tally
    if (r.status === 'success') summary.successful_nips++
    else if (r.status === 'partial') summary.partial_nips++
    else if (r.status === 'no_match') summary.no_match_nips++
    else summary.error_nips++

    // Write-back contact_enrichment per target_id (write to ВСЕ таргети
    // sharing this NIP). На no_match — write to first target_id only,
    // rest inherit nothing (avoid plodити no_match rows).
    let writeTargets: typeof item.target_ids = item.target_ids
    if (r.status === 'no_match' || r.status === 'error') {
      writeTargets = item.target_ids.slice(0, 1)
    }

    let writtenForThisNip = 0
    for (const t of writeTargets) {
      const row = {
        target_type: t.target_type,
        target_id: t.target_id,
        source: 'apify_gmaps',
        phone: r.phone,
        email: r.email,
        website: r.website,
        gmaps_url: r.gmaps_url,
        gmaps_rating: r.gmaps_rating,
        gmaps_reviews_count: r.gmaps_reviews_count,
        raw_payload: r.raw_payload,
        status: r.status,
        error_message: r.error_message ?? null,
        cost_usd: r.cost_usd,
        enriched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      }
      const { error: upErr } = await supabase
        .from('contact_enrichment')
        .upsert(row, { onConflict: 'target_type,target_id,source' })
      if (!upErr) writtenForThisNip++
      else
        console.warn(
          `[APIFY_BATCH] upsert failed nip=${item.nip} target=${t.target_id}: ${upErr.message}`,
        )
    }
    summary.rows_inserted += writtenForThisNip

    summary.per_nip.push({
      nip: item.nip,
      name: item.name,
      status: r.status,
      targets_written: writtenForThisNip,
      cost_usd: r.cost_usd,
      error: r.error_message,
    })
  }

  summary.total_cost_usd = Math.round(summary.total_cost_usd * 10000) / 10000
  summary.duration_ms = Date.now() - startedAt
  return summary
}

export const APIFY_BATCH_BUDGET_DEFAULT = COST_BUDGET_USD_DEFAULT
