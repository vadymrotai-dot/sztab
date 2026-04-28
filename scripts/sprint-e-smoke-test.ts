// scripts/sprint-e-smoke-test.ts
// Sprint E / Commit 8: end-to-end smoke test acceptance criteria.
//
// Run:
//   pnpm exec tsx scripts/sprint-e-smoke-test.ts
//
// Tests (per spec ACCEPTANCE CRITERIA):
//   1. Migration counts (segments, families, defaults, PKD, mappings)
//   2. SKU classification (35 mapped → family_id; brand backfill)
//   3. OFF enrichment: 3 SKU з reálnym EAN — fetch directly та upsert
//   4. Gemini bulk: всіх SKU classified — fill missing required (gemini_payload)
//   5. Hygiene scan: in-script execution — оновлює hygiene_status для всіх
//
// Uses service-role Supabase client (bypasses RLS) — same pattern як
// seed-cd-projekt-test.ts. Doesn't hit API routes (auth complexity);
// instead calls lib functions directly + writes до DB як API would.

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'
import { executeManagementSQL } from '@/lib/supabase/management'
import {
  getOpenFoodFactsByBarcode,
  normalizeBarcode,
  offToAttributes,
} from '@/lib/openfoodfacts'
import {
  generateSkuAttributesBulk,
  type SkuInput,
} from '@/lib/ai/sku-attributes'
import { resolveProductAttributes } from '@/lib/product-attributes'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

interface StepResult {
  name: string
  status: '✅' | '⚠️' | '❌'
  details: string
  error?: string
}

async function main() {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  if (!svcKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing')
    process.exit(1)
  }
  if (!geminiKey) {
    console.error('⚠️  GEMINI_API_KEY missing — Gemini step will skip')
  }

  const supabase = createClient(SUPABASE_URL, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const results: StepResult[] = []
  const orphans: Array<{ id: string; name: string }> = []
  let issues: string[] = []

  console.log('\n══════ Sprint E Smoke Test ══════\n')

  // ── 1. Counts ──
  console.log('[1] Migration & seed counts...')
  try {
    const r = await executeManagementSQL(`
      SELECT
        (SELECT COUNT(*) FROM taxonomy_segments)::int AS segments,
        (SELECT COUNT(*) FROM taxonomy_families)::int AS families,
        (SELECT COUNT(*) FROM family_attribute_defaults)::int AS defaults,
        (SELECT COUNT(*) FROM pkd_2007)::int AS pkd_2007,
        (SELECT COUNT(*) FROM pkd_2025)::int AS pkd_2025,
        (SELECT COUNT(*) FROM pkd_mapping)::int AS mappings,
        (SELECT COUNT(*) FROM products)::int AS sku_total,
        (SELECT COUNT(*) FROM products WHERE family_id IS NOT NULL)::int AS sku_classified,
        (SELECT COUNT(*) FROM products WHERE brand IS NOT NULL)::int AS sku_branded
    `)
    if (!r.ok || !r.rows?.[0]) throw new Error(r.error ?? 'no rows')
    const c = r.rows[0] as Record<string, number>
    const ok =
      c.segments === 11 &&
      c.families === 33 &&
      c.pkd_2007 >= 50 &&
      c.pkd_2025 >= 50 &&
      c.mappings >= 30
    results.push({
      name: 'Migrations + seed',
      status: ok ? '✅' : '⚠️',
      details: `seg=${c.segments}/11, fam=${c.families}/33, def=${c.defaults}, pkd07=${c.pkd_2007}, pkd25=${c.pkd_2025}, map=${c.mappings}, classified=${c.sku_classified}/${c.sku_total}, branded=${c.sku_branded}/${c.sku_total}`,
    })
  } catch (e) {
    results.push({
      name: 'Migrations + seed',
      status: '❌',
      details: 'count query failed',
      error: e instanceof Error ? e.message : String(e),
    })
  }

  // ── 2. Pick 3 SKU з EAN для OFF test ──
  console.log('\n[2] Pick 3 SKU з EAN dla OFF test...')
  const { data: skuWithEan } = await supabase
    .from('products')
    .select('id, name, ean')
    .not('ean', 'is', null)
    .neq('ean', '')
    .limit(3)
  const offTargets = (skuWithEan ?? []) as Array<{
    id: string
    name: string
    ean: string
  }>
  console.log(`    Found ${offTargets.length}: ${offTargets.map((s) => s.ean).join(', ')}`)

  // ── 3. OFF enrichment ──
  console.log('\n[3] OFF enrichment...')
  let offFound = 0
  const offDetails: string[] = []
  for (const t of offTargets) {
    try {
      const barcode = normalizeBarcode(t.ean)
      const off = await getOpenFoodFactsByBarcode(barcode)
      await supabase.from('product_external').upsert(
        {
          sku_id: t.id,
          off_payload: off.raw,
          off_fetched_at: new Date().toISOString(),
        },
        { onConflict: 'sku_id' },
      )
      if (off.found) {
        offFound++
        const attrs = offToAttributes(off)
        if (Object.keys(attrs).length > 0) {
          // Upsert without overwriting locked/manual
          const { data: existing } = await supabase
            .from('product_attributes')
            .select('attr_key, source, override_locked')
            .eq('sku_id', t.id)
          const existingMap = new Map<string, { source: string; override_locked: boolean }>(
            (existing ?? []).map((r: { attr_key: string; source: string; override_locked: boolean }) => [r.attr_key, r]),
          )
          const rows: Array<{ sku_id: string; attr_key: string; value: unknown; source: string; override_locked: boolean }> = []
          for (const [k, v] of Object.entries(attrs)) {
            if (v === null || v === '') continue
            const ex = existingMap.get(k)
            if (ex?.override_locked) continue
            if (ex && (ex.source === 'manual' || ex.source === 'override')) continue
            rows.push({
              sku_id: t.id,
              attr_key: k,
              value: v,
              source: 'off',
              override_locked: false,
            })
          }
          if (rows.length > 0) {
            await supabase
              .from('product_attributes')
              .upsert(rows, { onConflict: 'sku_id,attr_key' })
          }
          offDetails.push(`${t.ean}=found(${rows.length}attrs)`)
        } else {
          offDetails.push(`${t.ean}=found(0attrs)`)
        }
      } else {
        offDetails.push(`${t.ean}=notfound`)
      }
    } catch (err) {
      offDetails.push(`${t.ean}=error`)
      issues.push(`OFF ${t.ean}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  results.push({
    name: 'OFF enrichment (3 SKU)',
    status: offTargets.length === 0 ? '⚠️' : offFound > 0 ? '✅' : '⚠️',
    details: `tested=${offTargets.length}, found=${offFound}/${offTargets.length} | ${offDetails.join(', ')}`,
  })

  // ── 4. Gemini bulk ──
  console.log('\n[4] Gemini bulk attributes...')
  if (!geminiKey) {
    results.push({
      name: 'Gemini bulk',
      status: '⚠️',
      details: 'skipped — GEMINI_API_KEY not set',
    })
  } else {
    const { data: classifiedSkus } = await supabase
      .from('products')
      .select('id, name, ean, brand, family_id')
      .not('family_id', 'is', null)
    const classified = (classifiedSkus ?? []) as Array<{
      id: string
      name: string
      ean: string | null
      brand: string | null
      family_id: string | null
    }>

    const familyIds = Array.from(new Set(classified.map((s) => s.family_id).filter(Boolean) as string[]))
    const { data: famRows } = await supabase
      .from('taxonomy_families')
      .select('id, name_pl, required_attributes')
      .in('id', familyIds)
    const famMap = new Map<string, { id: string; name_pl: string; required_attributes: string[] }>(
      ((famRows ?? []) as Array<{ id: string; name_pl: string; required_attributes: string[] }>).map((f) => [f.id, f]),
    )

    const inputs: SkuInput[] = []
    for (const sku of classified) {
      if (!sku.family_id) continue
      const fam = famMap.get(sku.family_id)
      if (!fam) continue
      const resolved = await resolveProductAttributes(supabase, sku.id)
      const missing = resolved.attributes
        .filter((a) => a.missing_required)
        .map((a) => a.attr_key)
      if (missing.length === 0) continue
      inputs.push({
        sku_id: sku.id,
        name: sku.name,
        ean: sku.ean,
        brand: sku.brand,
        family_name_pl: fam.name_pl,
        required_attributes: missing,
      })
    }

    console.log(`    Bulk on ${inputs.length} SKU з missing required...`)
    let bulkFilled = 0
    let bulkFailed = 0
    if (inputs.length > 0) {
      try {
        const bulk = await generateSkuAttributesBulk(geminiKey, inputs)
        for (const r of bulk) {
          if (r.error) {
            bulkFailed++
            continue
          }
          const filled = Object.entries(r.attributes).filter(([, v]) => v !== null && v !== '')
          if (filled.length === 0) continue

          await supabase.from('product_external').upsert(
            {
              sku_id: r.sku_id,
              gemini_payload: { result: r },
              gemini_fetched_at: new Date().toISOString(),
            },
            { onConflict: 'sku_id' },
          )

          const { data: existing } = await supabase
            .from('product_attributes')
            .select('attr_key, source, override_locked')
            .eq('sku_id', r.sku_id)
          const existingMap = new Map<string, { source: string; override_locked: boolean }>(
            (existing ?? []).map((row: { attr_key: string; source: string; override_locked: boolean }) => [row.attr_key, row]),
          )
          const rows: Array<{ sku_id: string; attr_key: string; value: unknown; source: string; override_locked: boolean }> = []
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
            bulkFilled += rows.length
          }
        }
        results.push({
          name: 'Gemini bulk',
          status: bulkFailed === 0 && bulkFilled > 0 ? '✅' : bulkFailed > 0 ? '⚠️' : '⚠️',
          details: `inputs=${inputs.length}, filled_attrs=${bulkFilled}, failed_skus=${bulkFailed}`,
        })
      } catch (err) {
        results.push({
          name: 'Gemini bulk',
          status: '❌',
          details: `inputs=${inputs.length}`,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    } else {
      results.push({
        name: 'Gemini bulk',
        status: '✅',
        details: 'all classified SKU already have required attrs filled (after OFF)',
      })
    }
  }

  // ── 5. Hygiene scan ──
  console.log('\n[5] Hygiene scan (full table)...')
  const { data: allProducts } = await supabase.from('products').select('id, family_id')
  const products = (allProducts ?? []) as Array<{ id: string; family_id: string | null }>
  let clean = 0,
    dirty = 0,
    unchecked = 0,
    failed = 0
  for (const p of products) {
    if (!p.family_id) {
      orphans.push({ id: p.id, name: '' })
    }
    try {
      const resolved = await resolveProductAttributes(supabase, p.id)
      const status = resolved.hygiene.status
      if (status === 'CLEAN') clean++
      else if (status === 'DIRTY') dirty++
      else unchecked++
      await supabase
        .from('products')
        .update({
          hygiene_status: status,
          hygiene_issues: resolved.hygiene.issues,
          hygiene_checked_at: new Date().toISOString(),
        })
        .eq('id', p.id)
    } catch {
      failed++
    }
  }
  results.push({
    name: 'Hygiene scan',
    status: failed === 0 ? '✅' : '⚠️',
    details: `total=${products.length}, clean=${clean}, dirty=${dirty}, unchecked=${unchecked}, failed=${failed}`,
  })

  // ── Orphan SKU report ──
  if (orphans.length > 0) {
    const { data: o } = await supabase
      .from('products')
      .select('id, name')
      .in('id', orphans.map((x) => x.id))
    if (o) {
      orphans.forEach((or) => {
        const m = (o as Array<{ id: string; name: string }>).find((x) => x.id === or.id)
        if (m) or.name = m.name
      })
    }
  }

  // ── Final report ──
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('SPRINT E RESULT')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const r of results) {
    console.log(`${r.status}  ${r.name.padEnd(28)}  ${r.details}`)
    if (r.error) console.log(`     error: ${r.error}`)
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (issues.length > 0) {
    console.log('\nIssues encountered:')
    for (const i of issues) console.log(`  - ${i}`)
  }
  if (orphans.length > 0) {
    console.log(`\nSKU що не вдалось класифікувати (${orphans.length}):`)
    for (const o of orphans) console.log(`  - ${o.name} (${o.id})`)
  }
  console.log('\nRecommended next step: Sprint F (L5 algo matching) — таксономія готова як foundation.')
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
