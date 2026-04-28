// app/api/admin/gemini-bulk-attributes/route.ts
// POST /api/admin/gemini-bulk-attributes
//
// One-shot bulk job: для всіх products з family_id (skipping orphans),
// для кожного SKU где required_attributes мають still-missing values —
// kick Gemini bulk fill (10 per batch). Existing values з source='manual'/
// 'override' albo override_locked=true НЕ перетираються.
//
// Returns: {ok, job_id, summary{total, processed, filled, skipped, failed}}.
// Sync execution — повертає full result у відповідь. job_id stored
// in-memory dla follow-up GET /api/admin/jobs/{id} poki instance hot.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSkuAttributesBulk, type SkuInput } from '@/lib/ai/sku-attributes'
import { createJob, finishJob } from '@/lib/jobs'
import { resolveProductAttributes } from '@/lib/product-attributes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface ProductRow {
  id: string
  name: string
  ean: string | null
  brand: string | null
  family_id: string | null
}

interface FamilyRow {
  id: string
  name_pl: string
  required_attributes: string[]
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    return NextResponse.json(
      { ok: false, error: 'GEMINI_API_KEY not set in .env.local' },
      { status: 500 },
    )
  }

  const job = createJob<unknown>('gemini-bulk-attributes')

  try {
    // Load all classified products
    const { data: productRows } = await supabase
      .from('products')
      .select('id, name, ean, brand, family_id')
      .not('family_id', 'is', null)
    const products = (productRows ?? []) as ProductRow[]

    // Load family info
    const familyIds = Array.from(
      new Set(products.map((p) => p.family_id).filter((x): x is string => Boolean(x))),
    )
    const { data: familyRows } = await supabase
      .from('taxonomy_families')
      .select('id, name_pl, required_attributes')
      .in('id', familyIds)
    const familyMap = new Map<string, FamilyRow>(
      ((familyRows ?? []) as FamilyRow[]).map((f) => [f.id, f]),
    )

    // For each product — figure out missing required attributes
    const skuInputs: SkuInput[] = []
    let skipped = 0
    for (const p of products) {
      const fam = p.family_id ? familyMap.get(p.family_id) : null
      if (!fam || fam.required_attributes.length === 0) {
        skipped++
        continue
      }
      const resolved = await resolveProductAttributes(supabase, p.id)
      const missing = resolved.attributes
        .filter((a) => a.missing_required)
        .map((a) => a.attr_key)
      if (missing.length === 0) {
        skipped++
        continue
      }
      skuInputs.push({
        sku_id: p.id,
        name: p.name,
        ean: p.ean,
        brand: p.brand,
        family_name_pl: fam.name_pl,
        required_attributes: missing,
      })
    }

    const summary = {
      total_products: products.length,
      to_process: skuInputs.length,
      skipped_no_missing: skipped,
      filled: 0,
      failed: 0,
      per_sku: [] as Array<{ sku_id: string; filled: number; error?: string }>,
    }

    if (skuInputs.length === 0) {
      finishJob(job.id, 'completed', summary)
      return NextResponse.json({ ok: true, job_id: job.id, summary })
    }

    const results = await generateSkuAttributesBulk(geminiKey, skuInputs)

    // Upsert results respecting locked + manual
    for (const r of results) {
      const filled = Object.entries(r.attributes).filter(
        ([, v]) => v !== null && v !== '',
      )
      if (r.error) {
        summary.failed++
        summary.per_sku.push({ sku_id: r.sku_id, filled: 0, error: r.error })
        continue
      }
      // Save raw гemini payload
      await supabase.from('product_external').upsert(
        {
          sku_id: r.sku_id,
          gemini_payload: { result: r },
          gemini_fetched_at: new Date().toISOString(),
        },
        { onConflict: 'sku_id' },
      )

      // Read existing для locked check
      const { data: existing } = await supabase
        .from('product_attributes')
        .select('attr_key, source, override_locked')
        .eq('sku_id', r.sku_id)
      const existingMap = new Map<
        string,
        { source: string; override_locked: boolean }
      >(
        (existing ?? []).map((row: { attr_key: string; source: string; override_locked: boolean }) => [row.attr_key, row]),
      )

      const rows: Array<{
        sku_id: string
        attr_key: string
        value: unknown
        source: string
        override_locked: boolean
      }> = []
      for (const [k, v] of filled) {
        const ex = existingMap.get(k)
        if (ex?.override_locked) continue
        if (ex && (ex.source === 'manual' || ex.source === 'override')) continue
        rows.push({
          sku_id: r.sku_id,
          attr_key: k,
          value: v,
          source: 'gemini',
          override_locked: false,
        })
      }
      if (rows.length > 0) {
        await supabase
          .from('product_attributes')
          .upsert(rows, { onConflict: 'sku_id,attr_key' })
      }
      summary.filled += rows.length
      summary.per_sku.push({ sku_id: r.sku_id, filled: rows.length })

      // Update hygiene status post-fill
      const resolved = await resolveProductAttributes(supabase, r.sku_id)
      await supabase
        .from('products')
        .update({
          hygiene_status: resolved.hygiene.status,
          hygiene_issues: resolved.hygiene.issues,
          hygiene_checked_at: new Date().toISOString(),
        })
        .eq('id', r.sku_id)
    }

    finishJob(job.id, 'completed', summary)
    return NextResponse.json({ ok: true, job_id: job.id, summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    finishJob(job.id, 'failed', undefined, msg)
    return NextResponse.json(
      { ok: false, job_id: job.id, error: msg },
      { status: 500 },
    )
  }
}
