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

// ─── Insert helper (delete-then-insert pattern) ───
//
// Partial UNIQUE indexes (matches_client_product_uniq WHERE client_id IS NOT NULL,
// matches_prospect_product_uniq WHERE prospect_id IS NOT NULL) cannot be used by
// PostgREST ON CONFLICT inference. Workaround: delete existing rows for the target
// scope before inserting fresh. Idempotent ефект same as upsert; semantics are
// "recompute = wipe + repopulate per target".
async function deleteExistingMatches(
  supabase: SupabaseClient,
  targetType: 'client' | 'prospect',
  targetIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  if (targetIds.length === 0) return { ok: true }
  const col = targetType === 'client' ? 'client_id' : 'prospect_id'
  const { error } = await supabase.from('matches').delete().in(col, targetIds)
  if (error) return { ok: false, error: `delete ${targetType}: ${error.message}` }
  return { ok: true }
}

async function deleteMatchesForProduct(
  supabase: SupabaseClient,
  productId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('matches').delete().eq('product_id', productId)
  if (error) return { ok: false, error: `delete product: ${error.message}` }
  return { ok: true }
}

async function insertMatchRows(
  supabase: SupabaseClient,
  rows: MatchUpsertRow[],
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true }
  const { error } = await supabase.from('matches').insert(rows)
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
  const del = await deleteExistingMatches(supabase, 'client', [clientId])
  if (!del.ok) return { ok: false, count: 0, error: del.error }
  const ins = await insertMatchRows(supabase, rows)
  return { ok: ins.ok, count: rows.length, error: ins.error }
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
  const del = await deleteExistingMatches(supabase, 'prospect', [prospectId])
  if (!del.ok) return { ok: false, count: 0, error: del.error }
  const ins = await insertMatchRows(supabase, rows)
  return { ok: ins.ok, count: rows.length, error: ins.error }
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

  // Wipe всі rows для цього product (cross-target)
  const delAll = await deleteMatchesForProduct(supabase, productId)
  if (!delAll.ok) return { ok: false, count: 0, error: delAll.error }

  // Clients
  const { data: clientRows } = await supabase
    .from('clients')
    .select(
      'id, title, nip, vat_status, gus_status, registered_date, krs_legal_form, krs_management_board, pkd_2025_codes, pkd_2007_codes, region',
    )
  const clientRowsArr = (clientRows ?? []) as ClientRow[]
  const clientInserts: MatchUpsertRow[] = []
  for (const c of clientRowsArr) {
    clientInserts.push(...buildMatches(clientToTarget(c), products, familyMap))
  }
  if (clientInserts.length > 0) {
    const r = await insertMatchRows(supabase, clientInserts)
    if (!r.ok) return { ok: false, count: 0, error: r.error }
    totalCount += clientInserts.length
  }

  // Prospects
  const { data: prospectRows } = await supabase
    .from('ceidg_prospects')
    .select(
      'id, name, nip, vat_status, gus_status, data_rozpoczecia, krs_legal_form, krs_management_board, pkd_main, pkd_all, wojewodztwo',
    )
  const prospectRowsArr = (prospectRows ?? []) as ProspectRow[]
  const prospectInserts: MatchUpsertRow[] = []
  for (const p of prospectRowsArr) {
    prospectInserts.push(...buildMatches(prospectToTarget(p), products, familyMap))
  }
  if (prospectInserts.length > 0) {
    const r = await insertMatchRows(supabase, prospectInserts)
    if (!r.ok) return { ok: false, count: 0, error: r.error }
    totalCount += prospectInserts.length
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

    // Delete existing client-side matches (для всіх клієнтів — bulk fresh
    // recompute). Avoids ON CONFLICT obstacle з partial UNIQUE indexes.
    const ids = rows.map((c) => c.id)
    if (ids.length > 0) {
      // Chunk DELETE (Postgres .in() works fine з кількістю IDs, але limit
      // на URL length у PostgREST — chunk 1000 safe).
      const delChunkSize = 1000
      for (let i = 0; i < ids.length; i += delChunkSize) {
        const chunk = ids.slice(i, i + delChunkSize)
        const del = await deleteExistingMatches(supabase, 'client', chunk)
        if (!del.ok) summary.errors.push(`clients delete chunk ${i / delChunkSize}: ${del.error}`)
      }
    }

    const allMatches: MatchUpsertRow[] = []
    for (const c of rows) {
      allMatches.push(...buildMatches(clientToTarget(c), products, familyMap))
    }
    const chunkSize = 1000
    for (let i = 0; i < allMatches.length; i += chunkSize) {
      const chunk = allMatches.slice(i, i + chunkSize)
      const r = await insertMatchRows(supabase, chunk)
      if (!r.ok) summary.errors.push(`clients insert chunk ${i / chunkSize}: ${r.error}`)
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
      // Delete existing prospect-side matches
      const ids = filtered.map((p) => p.id)
      if (ids.length > 0) {
        const delChunkSize = 1000
        for (let i = 0; i < ids.length; i += delChunkSize) {
          const chunk = ids.slice(i, i + delChunkSize)
          const del = await deleteExistingMatches(supabase, 'prospect', chunk)
          if (!del.ok) summary.errors.push(`prospects delete chunk ${i / delChunkSize}: ${del.error}`)
        }
      }
      const allMatches: MatchUpsertRow[] = []
      for (const p of filtered) {
        allMatches.push(...buildMatches(prospectToTarget(p), products, familyMap))
      }
      const chunkSize = 1000
      for (let i = 0; i < allMatches.length; i += chunkSize) {
        const chunk = allMatches.slice(i, i + chunkSize)
        const r = await insertMatchRows(supabase, chunk)
        if (!r.ok) summary.errors.push(`prospects insert chunk ${i / chunkSize}: ${r.error}`)
        else summary.pairs_inserted += chunk.length
      }
    } else {
      const rows = (prospectRows ?? []) as ProspectRow[]
      summary.prospects_processed = rows.length

      const ids = rows.map((p) => p.id)
      if (ids.length > 0) {
        const delChunkSize = 1000
        for (let i = 0; i < ids.length; i += delChunkSize) {
          const chunk = ids.slice(i, i + delChunkSize)
          const del = await deleteExistingMatches(supabase, 'prospect', chunk)
          if (!del.ok) summary.errors.push(`prospects delete chunk ${i / delChunkSize}: ${del.error}`)
        }
      }
      const allMatches: MatchUpsertRow[] = []
      for (const p of rows) {
        allMatches.push(...buildMatches(prospectToTarget(p), products, familyMap))
      }
      const chunkSize = 1000
      for (let i = 0; i < allMatches.length; i += chunkSize) {
        const chunk = allMatches.slice(i, i + chunkSize)
        const r = await insertMatchRows(supabase, chunk)
        if (!r.ok) summary.errors.push(`prospects insert chunk ${i / chunkSize}: ${r.error}`)
        else summary.pairs_inserted += chunk.length
      }
    }
  }

  summary.duration_ms = Date.now() - startedAt
  return summary
}
