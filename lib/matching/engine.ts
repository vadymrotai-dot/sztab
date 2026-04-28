// lib/matching/engine.ts
// High-level matching engine. Loads target rows + product/family data,
// runs aggregate(), batches upserts up to matches table.
//
// Key invariants:
//   - matches table has XOR client_id/prospect_id (per migration 026)
//   - upsert respects partial UNIQUE indexes per target type
//   - bulk path pre-loads products + families once (cache)
//   - Idempotent: UPSERT з onConflict, computed_at + expires_at refreshed

import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  MatchTarget,
  MatchProduct,
  MatchFamily,
  MatchResult,
} from './types'
import { aggregateMatch } from './scoring/aggregate'

const EXPIRY_DAYS = 7
const HORECA_DIVISIONS = ['10', '11', '46', '47', '56'] as const

interface MatchUpsertRow {
  client_id: string | null
  prospect_id: string | null
  product_id: string
  algo_score: number
  subscore_breakdown: MatchResult['subscore_breakdown']
  reason_codes: string[]
  loyalty_multiplier: number
  computed_at: string
  expires_at: string
}

// ─── Adapter helpers ───
interface ClientRow {
  id: string
  title: string
  nip: string | null
  vat_status: string | null
  gus_status: string | null
  registered_date: string | null
  krs_legal_form: string | null
  krs_management_board: unknown
  pkd_2025_codes: string[] | null
  pkd_2007_codes: string[] | null
  region: string | null
}

interface ProspectRow {
  id: string
  name: string
  nip: string | null
  vat_status: string | null
  gus_status: string | null
  data_rozpoczecia: string | null
  krs_legal_form: string | null
  krs_management_board: unknown
  pkd_main: string | null
  pkd_all: string[] | null
  wojewodztwo: string | null
}

function clientToTarget(row: ClientRow): MatchTarget {
  const board = Array.isArray(row.krs_management_board)
    ? (row.krs_management_board as unknown[]).length
    : null
  return {
    type: 'client',
    id: row.id,
    name: row.title,
    pkd_2025_codes: row.pkd_2025_codes,
    pkd_2007_codes: row.pkd_2007_codes,
    vat_status: row.vat_status,
    gus_status: row.gus_status,
    registered_date: row.registered_date,
    legal_form: row.krs_legal_form,
    board_size: board,
    voivodeship: row.region,
    chain_name: null, // Sprint F: chain detection not yet propagated to clients
    loyalty_tier: null,
  }
}

function prospectToTarget(row: ProspectRow): MatchTarget {
  const board = Array.isArray(row.krs_management_board)
    ? (row.krs_management_board as unknown[]).length
    : null
  // Combine pkd_main + pkd_all (both compact format від CEIDG)
  const pkd_all = new Set<string>()
  if (row.pkd_main) pkd_all.add(row.pkd_main)
  if (Array.isArray(row.pkd_all)) {
    for (const c of row.pkd_all) if (c) pkd_all.add(c)
  }
  return {
    type: 'prospect',
    id: row.id,
    name: row.name,
    pkd_2025_codes: null, // CEIDG returns 2007 format only
    pkd_2007_codes: pkd_all.size > 0 ? Array.from(pkd_all) : null,
    vat_status: row.vat_status,
    gus_status: row.gus_status,
    registered_date: row.data_rozpoczecia,
    legal_form: row.krs_legal_form,
    board_size: board,
    voivodeship: row.wojewodztwo,
    chain_name: null,
    loyalty_tier: null,
  }
}

// ─── Cache loaders ───
async function loadAllProducts(
  supabase: SupabaseClient,
): Promise<MatchProduct[]> {
  const { data } = await supabase
    .from('products')
    .select('id, name, family_id, brand, hygiene_status, price_tier')
    .not('family_id', 'is', null)
  return (data ?? []) as MatchProduct[]
}

async function loadFamiliesMap(
  supabase: SupabaseClient,
  familyIds: string[],
): Promise<Map<string, MatchFamily>> {
  if (familyIds.length === 0) return new Map()
  const { data } = await supabase
    .from('taxonomy_families')
    .select('id, name_pl, target_pkd_2025, target_pkd_2007')
    .in('id', familyIds)
  const m = new Map<string, MatchFamily>()
  for (const r of (data ?? []) as MatchFamily[]) m.set(r.id, r)
  return m
}

// ─── Pair builder ───
function buildMatches(
  target: MatchTarget,
  products: MatchProduct[],
  familyMap: Map<string, MatchFamily>,
): MatchUpsertRow[] {
  const now = new Date()
  const expires = new Date(now.getTime() + EXPIRY_DAYS * 86_400_000)
  const out: MatchUpsertRow[] = []

  for (const product of products) {
    const family = familyMap.get(product.family_id)
    if (!family) continue // unfamilied product — skip
    const result = aggregateMatch(target, product, family)
    out.push({
      client_id: target.type === 'client' ? target.id : null,
      prospect_id: target.type === 'prospect' ? target.id : null,
      product_id: product.id,
      algo_score: result.algo_score,
      subscore_breakdown: result.subscore_breakdown,
      reason_codes: result.reason_codes,
      loyalty_multiplier: result.loyalty_multiplier,
      computed_at: now.toISOString(),
      expires_at: expires.toISOString(),
    })
  }
  return out
}

// ─── Upsert helper ───
async function upsertMatchRows(
  supabase: SupabaseClient,
  rows: MatchUpsertRow[],
  targetType: 'client' | 'prospect',
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true }
  // Per partial UNIQUE indexes — separate onConflict
  const conflictTarget =
    targetType === 'client' ? 'client_id,product_id' : 'prospect_id,product_id'
  const { error } = await supabase
    .from('matches')
    .upsert(rows, { onConflict: conflictTarget })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── Public API ───

export async function computeMatchesForClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data, error: cErr } = await supabase
    .from('clients')
    .select(
      'id, title, nip, vat_status, gus_status, registered_date, krs_legal_form, krs_management_board, pkd_2025_codes, pkd_2007_codes, region',
    )
    .eq('id', clientId)
    .single()
  if (cErr || !data) return { ok: false, count: 0, error: cErr?.message ?? 'not found' }

  const target = clientToTarget(data as ClientRow)
  const products = await loadAllProducts(supabase)
  const familyMap = await loadFamiliesMap(
    supabase,
    Array.from(new Set(products.map((p) => p.family_id))),
  )
  const rows = buildMatches(target, products, familyMap)
  const r = await upsertMatchRows(supabase, rows, 'client')
  return { ok: r.ok, count: rows.length, error: r.error }
}

export async function computeMatchesForProspect(
  supabase: SupabaseClient,
  prospectId: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data, error } = await supabase
    .from('ceidg_prospects')
    .select(
      'id, name, nip, vat_status, gus_status, data_rozpoczecia, krs_legal_form, krs_management_board, pkd_main, pkd_all, wojewodztwo',
    )
    .eq('id', prospectId)
    .single()
  if (error || !data) return { ok: false, count: 0, error: error?.message ?? 'not found' }

  const target = prospectToTarget(data as ProspectRow)
  const products = await loadAllProducts(supabase)
  const familyMap = await loadFamiliesMap(
    supabase,
    Array.from(new Set(products.map((p) => p.family_id))),
  )
  const rows = buildMatches(target, products, familyMap)
  const r = await upsertMatchRows(supabase, rows, 'prospect')
  return { ok: r.ok, count: rows.length, error: r.error }
}

/** Recompute matches keyed by single product. Iterates all clients + prospects. */
export async function computeMatchesForProduct(
  supabase: SupabaseClient,
  productId: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data: prodRow } = await supabase
    .from('products')
    .select('id, name, family_id, brand, hygiene_status, price_tier')
    .eq('id', productId)
    .single()
  if (!prodRow) return { ok: false, count: 0, error: 'product not found' }
  const product = prodRow as MatchProduct
  if (!product.family_id) return { ok: false, count: 0, error: 'product has no family_id' }

  const { data: famRow } = await supabase
    .from('taxonomy_families')
    .select('id, name_pl, target_pkd_2025, target_pkd_2007')
    .eq('id', product.family_id)
    .single()
  if (!famRow) return { ok: false, count: 0, error: 'family not found' }
  const familyMap = new Map<string, MatchFamily>([[product.family_id, famRow as MatchFamily]])
  const products = [product]

  let totalCount = 0

  // Clients
  const { data: clientRows } = await supabase
    .from('clients')
    .select(
      'id, title, nip, vat_status, gus_status, registered_date, krs_legal_form, krs_management_board, pkd_2025_codes, pkd_2007_codes, region',
    )
  const clientRowsArr = (clientRows ?? []) as ClientRow[]
  const clientUpserts: MatchUpsertRow[] = []
  for (const c of clientRowsArr) {
    clientUpserts.push(...buildMatches(clientToTarget(c), products, familyMap))
  }
  if (clientUpserts.length > 0) {
    const r = await upsertMatchRows(supabase, clientUpserts, 'client')
    if (!r.ok) return { ok: false, count: 0, error: r.error }
    totalCount += clientUpserts.length
  }

  // Prospects (HoReCa-relevant — already CEIDG-bootstrap pre-filtered)
  const { data: prospectRows } = await supabase
    .from('ceidg_prospects')
    .select(
      'id, name, nip, vat_status, gus_status, data_rozpoczecia, krs_legal_form, krs_management_board, pkd_main, pkd_all, wojewodztwo',
    )
  const prospectRowsArr = (prospectRows ?? []) as ProspectRow[]
  const prospectUpserts: MatchUpsertRow[] = []
  for (const p of prospectRowsArr) {
    prospectUpserts.push(...buildMatches(prospectToTarget(p), products, familyMap))
  }
  if (prospectUpserts.length > 0) {
    const r = await upsertMatchRows(supabase, prospectUpserts, 'prospect')
    if (!r.ok) return { ok: false, count: 0, error: r.error }
    totalCount += prospectUpserts.length
  }

  return { ok: true, count: totalCount }
}

interface BulkSummary {
  clients_processed: number
  prospects_processed: number
  pairs_inserted: number
  duration_ms: number
  errors: string[]
}

export async function bulkRecomputeAll(
  supabase: SupabaseClient,
  options: { clientsOnly?: boolean; prospectsOnly?: boolean } = {},
): Promise<BulkSummary> {
  const startedAt = Date.now()
  const summary: BulkSummary = {
    clients_processed: 0,
    prospects_processed: 0,
    pairs_inserted: 0,
    duration_ms: 0,
    errors: [],
  }

  const products = await loadAllProducts(supabase)
  const familyMap = await loadFamiliesMap(
    supabase,
    Array.from(new Set(products.map((p) => p.family_id))),
  )
  if (products.length === 0) {
    summary.errors.push('No products з family_id — populate taxonomy first')
    summary.duration_ms = Date.now() - startedAt
    return summary
  }

  // Clients
  if (!options.prospectsOnly) {
    const { data: clientRows, error: cErr } = await supabase
      .from('clients')
      .select(
        'id, title, nip, vat_status, gus_status, registered_date, krs_legal_form, krs_management_board, pkd_2025_codes, pkd_2007_codes, region',
      )
    if (cErr) summary.errors.push(`clients fetch: ${cErr.message}`)
    const rows = (clientRows ?? []) as ClientRow[]
    summary.clients_processed = rows.length

    const allMatches: MatchUpsertRow[] = []
    for (const c of rows) {
      allMatches.push(...buildMatches(clientToTarget(c), products, familyMap))
    }
    // Chunk upserts (Postgres can choke on huge batches; 1000 rows safe)
    const chunkSize = 1000
    for (let i = 0; i < allMatches.length; i += chunkSize) {
      const chunk = allMatches.slice(i, i + chunkSize)
      const r = await upsertMatchRows(supabase, chunk, 'client')
      if (!r.ok) summary.errors.push(`clients chunk ${i / chunkSize}: ${r.error}`)
      else summary.pairs_inserted += chunk.length
    }
  }

  // Prospects (HoReCa pre-filter via SQL — division 10/11/46/47/56)
  if (!options.clientsOnly) {
    // Use SQL filter в Postgres (faster ніж pulling всіх then filter app-side).
    const horecaPattern = `^(${HORECA_DIVISIONS.join('|')})`
    const { data: prospectRows, error: pErr } = await supabase
      .from('ceidg_prospects')
      .select(
        'id, name, nip, vat_status, gus_status, data_rozpoczecia, krs_legal_form, krs_management_board, pkd_main, pkd_all, wojewodztwo',
      )
      .or(
        `pkd_main.match.${horecaPattern},pkd_all.cs.{${HORECA_DIVISIONS.map((d) => `"${d}"`).join(',')}}`,
      )
    if (pErr) {
      // Fallback: pull всіх + filter app-side (in case .or syntax не fits)
      const { data: allRows, error: pErr2 } = await supabase
        .from('ceidg_prospects')
        .select(
          'id, name, nip, vat_status, gus_status, data_rozpoczecia, krs_legal_form, krs_management_board, pkd_main, pkd_all, wojewodztwo',
        )
      if (pErr2) summary.errors.push(`prospects fetch fallback: ${pErr2.message}`)
      const filtered = ((allRows ?? []) as ProspectRow[]).filter((p) => {
        const main = p.pkd_main ?? ''
        const allArr = p.pkd_all ?? []
        return (
          HORECA_DIVISIONS.some((d) => main.startsWith(d)) ||
          allArr.some((c) => HORECA_DIVISIONS.some((d) => c.startsWith(d)))
        )
      })
      summary.prospects_processed = filtered.length
      const allMatches: MatchUpsertRow[] = []
      for (const p of filtered) {
        allMatches.push(...buildMatches(prospectToTarget(p), products, familyMap))
      }
      const chunkSize = 1000
      for (let i = 0; i < allMatches.length; i += chunkSize) {
        const chunk = allMatches.slice(i, i + chunkSize)
        const r = await upsertMatchRows(supabase, chunk, 'prospect')
        if (!r.ok) summary.errors.push(`prospects chunk ${i / chunkSize}: ${r.error}`)
        else summary.pairs_inserted += chunk.length
      }
    } else {
      const rows = (prospectRows ?? []) as ProspectRow[]
      summary.prospects_processed = rows.length

      const allMatches: MatchUpsertRow[] = []
      for (const p of rows) {
        allMatches.push(...buildMatches(prospectToTarget(p), products, familyMap))
      }
      const chunkSize = 1000
      for (let i = 0; i < allMatches.length; i += chunkSize) {
        const chunk = allMatches.slice(i, i + chunkSize)
        const r = await upsertMatchRows(supabase, chunk, 'prospect')
        if (!r.ok) summary.errors.push(`prospects chunk ${i / chunkSize}: ${r.error}`)
        else summary.pairs_inserted += chunk.length
      }
    }
  }

  summary.duration_ms = Date.now() - startedAt
  return summary
}
