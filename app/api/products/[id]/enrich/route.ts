// app/api/products/[id]/enrich/route.ts
// POST /api/products/{id}/enrich
//   Body: {} (empty) або { force?: boolean } — bypass 7-day cache check.
//
// Pipeline:
//   1. Resolve product → ean + family_id + required_attributes
//   2. OFF: якщо EAN існує → fetch (skip if cached < 7 days unless force)
//      → upsert product_attributes (source='off') WHERE override_locked=false
//   3. Gemini fallback: для still-missing required → bulk attrs (1 batch =
//      1 SKU) → upsert product_attributes (source='gemini')
//   4. Resolve final merged view + hygiene + return.
//
// Idempotent w sensie: re-run на already-enriched SKU не overwrite values
// у product_attributes z source='manual'/'override' albo override_locked=true.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getOpenFoodFactsByBarcode,
  normalizeBarcode,
  offToAttributes,
} from '@/lib/openfoodfacts'
import { generateSkuAttributesBulk, type SkuInput } from '@/lib/ai/sku-attributes'
import { resolveProductAttributes } from '@/lib/product-attributes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

const OFF_CACHE_DAYS = 7

interface RequestBody {
  force?: boolean
}

interface ProductRow {
  id: string
  ean: string | null
  brand: string | null
  family_id: string | null
  name: string
}

interface ProductExternalRow {
  off_fetched_at: string | null
  off_payload: unknown
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Niepoprawny product id' }, { status: 400 })
  }

  let body: RequestBody = {}
  try {
    body = (await req.json()) as RequestBody
  } catch {
    body = {}
  }

  // 1. Load product
  const { data: productRow, error: pErr } = await supabase
    .from('products')
    .select('id, ean, brand, family_id, name')
    .eq('id', id)
    .single()
  if (pErr || !productRow) {
    return NextResponse.json({ ok: false, error: `Product not found: ${id}` }, { status: 404 })
  }
  const product = productRow as ProductRow

  if (!product.family_id) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Produkt nie ma family_id — sklasyfikuj go najpierw (taxonomy → Family).',
      },
      { status: 422 },
    )
  }

  // Family + required_attributes
  const { data: familyRow } = await supabase
    .from('taxonomy_families')
    .select('id, name_pl, required_attributes')
    .eq('id', product.family_id)
    .single()
  const familyName: string = (familyRow?.name_pl as string | undefined) ?? 'unknown'
  const required: string[] = (familyRow?.required_attributes as string[] | undefined) ?? []

  const log: string[] = []

  // 2. OFF (only if EAN)
  let offUsed = false
  if (product.ean) {
    const barcode = normalizeBarcode(product.ean)
    if (!/^\d{8,14}$/.test(barcode)) {
      log.push(`OFF: skipped — invalid EAN format (${product.ean})`)
    } else {
      // Check cache
      const { data: extRow } = await supabase
        .from('product_external')
        .select('off_fetched_at, off_payload')
        .eq('sku_id', id)
        .maybeSingle()
      const ext = extRow as ProductExternalRow | null

      const cacheAgeMs = ext?.off_fetched_at
        ? Date.now() - new Date(ext.off_fetched_at).getTime()
        : Infinity
      const cacheStale = cacheAgeMs > OFF_CACHE_DAYS * 86_400_000
      const shouldFetch = body.force || cacheStale || !ext?.off_payload

      if (!shouldFetch) {
        log.push(
          `OFF: cached < ${OFF_CACHE_DAYS}d (age ${Math.round(cacheAgeMs / 86_400_000)}d) — skip`,
        )
      } else {
        try {
          const off = await getOpenFoodFactsByBarcode(barcode)
          // Upsert into product_external
          await supabase.from('product_external').upsert(
            {
              sku_id: id,
              off_payload: off.raw,
              off_fetched_at: new Date().toISOString(),
            },
            { onConflict: 'sku_id' },
          )

          if (off.found) {
            offUsed = true
            const offAttrs = offToAttributes(off)
            log.push(`OFF: found, ${Object.keys(offAttrs).length} attrs extracted`)
            await upsertAttrs(supabase, id, offAttrs, 'off')
          } else {
            log.push('OFF: product not found')
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log.push(`OFF: error ${msg}`)
        }
      }
    }
  } else {
    log.push('OFF: skipped — no EAN')
  }

  // 3. Re-resolve to find still-missing required
  let resolved = await resolveProductAttributes(supabase, id)
  const stillMissing = resolved.attributes
    .filter((a) => a.missing_required)
    .map((a) => a.attr_key)

  // 4. Gemini fallback if any required still missing
  let geminiUsed = false
  if (stillMissing.length > 0) {
    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) {
      log.push(`Gemini: skipped — GEMINI_API_KEY not set (${stillMissing.length} still missing)`)
    } else {
      const skuInput: SkuInput = {
        sku_id: id,
        name: product.name,
        ean: product.ean,
        brand: product.brand,
        family_name_pl: familyName,
        required_attributes: stillMissing,
      }
      try {
        const results = await generateSkuAttributesBulk(geminiKey, [skuInput])
        const r = results[0]
        if (r && Object.keys(r.attributes).length > 0) {
          geminiUsed = true
          // Save raw response в product_external
          await supabase.from('product_external').upsert(
            {
              sku_id: id,
              gemini_payload: { result: r, requested: stillMissing },
              gemini_fetched_at: new Date().toISOString(),
            },
            { onConflict: 'sku_id' },
          )
          await upsertAttrs(supabase, id, r.attributes, 'gemini')
          log.push(`Gemini: filled ${Object.keys(r.attributes).length} attrs`)
        } else {
          log.push(`Gemini: no attrs generated (${r?.error ?? 'empty'})`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.push(`Gemini: error ${msg}`)
      }
    }
  }

  // 5. Final resolved view
  resolved = await resolveProductAttributes(supabase, id)

  // Update products.hygiene_status (synchronous post-enrich)
  await supabase
    .from('products')
    .update({
      hygiene_status: resolved.hygiene.status,
      hygiene_issues: resolved.hygiene.issues,
      hygiene_checked_at: new Date().toISOString(),
    })
    .eq('id', id)

  return NextResponse.json({
    ok: true,
    data: resolved,
    meta: { off_used: offUsed, gemini_used: geminiUsed, log },
  })
}

// ─── helper: bulk upsert attribute rows w respektowaniem locked ───
async function upsertAttrs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  skuId: string,
  attrs: Record<string, unknown>,
  source: 'off' | 'gemini',
) {
  // Read existing rows to check locked + don't overwrite manual/override
  const { data: existingRows } = await supabase
    .from('product_attributes')
    .select('attr_key, source, override_locked')
    .eq('sku_id', skuId)
  const existing = new Map<
    string,
    { source: string; override_locked: boolean }
  >((existingRows ?? []).map((r: { attr_key: string; source: string; override_locked: boolean }) => [r.attr_key, r]))

  const rowsToUpsert: Array<{
    sku_id: string
    attr_key: string
    value: unknown
    source: string
    override_locked: boolean
  }> = []

  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === '') continue
    const ex = existing.get(k)
    if (ex?.override_locked) continue
    if (ex && (ex.source === 'manual' || ex.source === 'override')) continue
    rowsToUpsert.push({
      sku_id: skuId,
      attr_key: k,
      value: v,
      source,
      override_locked: false,
    })
  }

  if (rowsToUpsert.length === 0) return
  const { error } = await supabase
    .from('product_attributes')
    .upsert(rowsToUpsert, { onConflict: 'sku_id,attr_key' })
  if (error) {
    console.error(`[ENRICH] upsert error ${source}:`, error.message)
  }
}
