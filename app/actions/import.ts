'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import type {
  CommitOptions,
  ImportResult,
  ImportPreset,
} from '@/lib/importers/types'
import type { ImportedProductDraft } from '@/lib/importers/supplier-price-list'

// Reads `kurs_eur_pln` and `overhead_multiplier` from the settings table.
// Falls back to safe defaults if a key is missing.
async function readPricingSettings(): Promise<{
  kurs: number
  overhead: number
}> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['kurs_eur_pln', 'overhead_multiplier'])
  const map: Record<string, string> = {}
  for (const row of data ?? []) map[row.key as string] = row.value as string
  return {
    kurs: Number.parseFloat(map.kurs_eur_pln ?? '4.28') || 4.28,
    overhead:
      Number.parseFloat(map.overhead_multiplier ?? '1.15') || 1.15,
  }
}

// Map ean → product.id for products of this owner+supplier whose EAN
// matches anything in the input list. Used to flag duplicates.
export async function findProductsByEans(
  eans: string[],
  supplierId: string,
): Promise<Record<string, string>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return {}

  const dedup = Array.from(new Set(eans.filter((e) => e && e.length > 0)))
  if (dedup.length === 0) return {}

  const { data } = await supabase
    .from('products')
    .select('id, ean')
    .eq('owner_id', user.id)
    .eq('supplier_id', supplierId)
    .in('ean', dedup)

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    if (row.ean && row.id) map[row.ean as string] = row.id as string
  }
  return map
}

interface CommitInput {
  ean: string | null | undefined
  draft: Partial<ImportedProductDraft>
  status: 'new' | 'duplicate' | 'invalid'
}

// Bulk insert/update products from a price-list import.
// - status='invalid' rows are skipped.
// - status='new' → INSERT.
// - status='duplicate' AND options.updateExisting=true → UPDATE matching row.
// - status='duplicate' AND options.updateExisting=false → skip.
// All commits scoped to (owner_id, supplier_id) — RLS-safe.
export async function batchCommitProducts(
  rows: CommitInput[],
  options: CommitOptions,
): Promise<ImportResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: rows.length,
      errors: [{ row: 0, message: 'Sesja wygasła' }],
    }
  }

  if (!options.supplierId) {
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: rows.length,
      errors: [{ row: 0, message: 'Brak supplier_id w commit options' }],
    }
  }

  const { kurs, overhead } = await readPricingSettings()

  // Pre-resolve duplicate ids in one query so we don't issue N selects.
  const eans = rows
    .filter((r) => r.status === 'duplicate' && r.ean)
    .map((r) => r.ean as string)
  const existingMap =
    eans.length > 0
      ? await findProductsByEans(eans, options.supplierId)
      : {}

  let inserted = 0
  let updated = 0
  let skipped = 0
  let failed = 0
  const errors: { row: number; message: string }[] = []

  // Sequential — Supabase JS doesn't have a generic batch upsert that fits
  // our "split insert vs update" rule cleanly. Volumes for a price list
  // are <500 rows so per-row latency is acceptable.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.status === 'invalid') {
      skipped++
      continue
    }

    const cost_eur = r.draft.cost_eur ?? 0
    const cost_pln = cost_eur > 0 ? +(cost_eur * kurs * overhead).toFixed(2) : 0

    const payload = {
      owner_id: user.id,
      supplier_id: options.supplierId,
      name: r.draft.name ?? '',
      gramatura: r.draft.gramatura ?? null,
      ean: r.draft.ean ?? null,
      cost_eur,
      cost_pln,
      category: r.draft.category ?? null,
      is_hero: r.draft.is_hero ?? false,
      seasonality_status: r.draft.seasonality_status ?? null,
      tags: r.draft.tags ?? [],
    }

    if (r.status === 'duplicate') {
      if (!options.updateExisting) {
        skipped++
        continue
      }
      const existingId = r.ean ? existingMap[r.ean] : undefined
      if (!existingId) {
        skipped++
        continue
      }
      const { error } = await supabase
        .from('products')
        .update({
          // Preserve owner_id/supplier_id; only refresh price-list payload.
          name: payload.name,
          gramatura: payload.gramatura,
          cost_eur: payload.cost_eur,
          cost_pln: payload.cost_pln,
          category: payload.category,
          is_hero: payload.is_hero,
          seasonality_status: payload.seasonality_status,
          tags: payload.tags,
        })
        .eq('id', existingId)
        .eq('owner_id', user.id)
      if (error) {
        failed++
        errors.push({ row: i + 1, message: error.message })
      } else {
        updated++
      }
      continue
    }

    // status === 'new'
    const { error } = await supabase.from('products').insert(payload)
    if (error) {
      failed++
      errors.push({ row: i + 1, message: error.message })
    } else {
      inserted++
    }
  }

  revalidatePath('/products')
  return { inserted, updated, skipped, failed, errors: errors.slice(0, 20) }
}

// Persist a column→field mapping so the next import for this supplier
// can skip the mapping step entirely.
export async function saveImportPreset(
  supplierId: string,
  preset: ImportPreset,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const { error } = await supabase
    .from('suppliers')
    .update({ import_preset: preset })
    .eq('id', supplierId)
    .eq('owner_id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/suppliers')
  return { ok: true }
}
