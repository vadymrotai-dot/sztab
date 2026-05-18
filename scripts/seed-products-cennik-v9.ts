#!/usr/bin/env tsx
// scripts/seed-products-cennik-v9.ts
// Sprint S-ORDER.1.A (19.05.2026) — seed/update 17 CzM SKU з cennika v9.
//
// Pattern:
//   1. Match by lowercase substring keys + gramatura substring.
//   2. UPDATE products SET display_name, price_maly_opt, price_sredni,
//      price_duzy, show_in_orders=TRUE, order_form_sort, updated_at=NOW().
//   3. Idempotent — re-running overwrites з same values.
//
// Pre-flight (Vadym applies перш):
//   1. Apply migration 068_orders_schema.sql (adds show_in_orders, etc.)
//
// CLI:
//   pnpm exec tsx scripts/seed-products-cennik-v9.ts
//
// Expected: 17/17 updated, 0 errors. After: SELECT COUNT(*) FROM products
// WHERE show_in_orders=TRUE → 17.

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'

interface CennikItem {
  lp: number
  match: string          // lowercase substring of products.name
  gram: string           // substring of products.gramatura
  display: string        // user-facing short name для cennik/form
  p_m: number            // price_maly_opt (mały optowy)
  p_s: number            // price_sredni
  p_d: number            // price_duzy
  exclude?: string[]     // lowercase reject keys (для disambiguation)
}

const CENNIK_V9: CennikItem[] = [
  { lp: 1,  match: 'kapusta kiszona', gram: '3000', display: 'Kapusta kiszona', p_m: 15.66, p_s: 14.79, p_d: 13.92,
    exclude: ['żurawiną','papryką','ogórkami','marynacie','burakami','marchew','papryka','marchwi','tradycyjna','pełuska','świeżej'] },
  { lp: 2,  match: 'kapusta kiszona z żurawiną', gram: '3000', display: 'Kapusta kiszona z żurawiną',
    p_m: 20.13, p_s: 19.01, p_d: 17.90 },
  { lp: 3,  match: 'kapusta kiszona z papryką', gram: '3000', display: 'Kapusta kiszona z papryką słodką',
    p_m: 20.13, p_s: 19.01, p_d: 17.90, exclude: ['tradycyjna','marchew'] },
  { lp: 4,  match: 'kapusta kiszona z ogórkami', gram: '3000', display: 'Kapusta kiszona z ogórkami',
    p_m: 20.13, p_s: 19.01, p_d: 17.90 },
  { lp: 5,  match: 'świeżej kapusty w marynacie', gram: '3000', display: 'Świeża kapusta w marynacie',
    p_m: 29.12, p_s: 27.50, p_d: 25.88 },
  { lp: 6,  match: 'kapusta z burakami', gram: '3000', display: 'Kapusta z burakami w marynacie',
    p_m: 22.50, p_s: 21.25, p_d: 20.00, exclude: ['pełuska'] },
  { lp: 7,  match: 'pełuska', gram: '3000', display: 'Pełuska — kapusta w marynacie buraczanej',
    p_m: 18.45, p_s: 17.43, p_d: 16.40 },
  { lp: 8,  match: 'tradycyjna', gram: '3000', display: 'Tradycyjna — kapusta, marchew, papryka',
    p_m: 27.67, p_s: 26.13, p_d: 24.59, exclude: ['marchwi','marchewka','pełuska','burakami','żurawiną','papryką słodką'] },
  { lp: 9,  match: 'tradycyjna', gram: '900', display: 'Tradycyjna — kapusta, marchew, papryka',
    p_m: 10.35, p_s:  9.78, p_d:  9.20, exclude: ['marchwi','marchewka','pełuska','burakami','żurawiną'] },
  { lp: 10, match: 'marchwi po koreańsku', gram: '3000', display: 'Marchewka po koreańsku',
    p_m: 27.67, p_s: 26.13, p_d: 24.59 },
  { lp: 11, match: 'marchwi po koreańsku', gram: '900', display: 'Marchewka po koreańsku',
    p_m:  8.31, p_s:  7.85, p_d:  7.38 },
  { lp: 12, match: 'sałatka z buraków', gram: '3000', display: 'Sałatka z buraków czerwonych',
    p_m: 29.07, p_s: 27.45, p_d: 25.84 },
  { lp: 13, match: 'buraki gotowane', gram: '1500', display: 'Buraki gotowane sterylizowane',
    p_m: 14.40, p_s: 13.60, p_d: 12.80 },
  { lp: 14, match: 'ogórki kiszone', gram: '5000', display: 'Ogórki kiszone — wiadro 5L',
    p_m: 27.67, p_s: 26.13, p_d: 24.59 },
  { lp: 15, match: 'ogórki kiszone', gram: '1000', display: 'Ogórki kiszone — słoik 1L',
    p_m:  5.85, p_s:  5.52, p_d:  5.20 },
  { lp: 16, match: 'pomidory w przyprawach', gram: '5000', display: 'Pomidory kiszone — wiadro 5L (ostatnie sztuki)',
    p_m: 27.67, p_s: 26.13, p_d: 24.59 },
  { lp: 17, match: 'pomidory w przyprawach', gram: '1000', display: 'Pomidory kiszone — słoik 1L (ostatnie sztuki)',
    p_m:  5.85, p_s:  5.52, p_d:  5.20 },
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
    process.exit(1)
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('Sprint S-ORDER.1.A — seed/update 17 CzM SKU з cennika v9')
  console.log(`Total items у CENNIK_V9: ${CENNIK_V9.length}`)
  console.log()

  // Pre-fetch всі CzM products
  const { data: czmProducts, error: fetchErr } = await supabase
    .from('products')
    .select('id, name, gramatura, brand')
    .ilike('brand', '%czudow%')
    .limit(200)
  if (fetchErr) {
    console.error('Fetch products failed:', fetchErr.message)
    process.exit(1)
  }
  console.log(`CzM products у DB: ${czmProducts?.length ?? 0}\n`)

  let updated = 0
  const zeroMatch: CennikItem[] = []
  const ambiguous: { item: CennikItem; cands: Array<{ id: string; name: string; gramatura: string }> }[] = []

  for (const c of CENNIK_V9) {
    const cands = (czmProducts ?? []).filter((p) => {
      const n = (p.name ?? '').toLowerCase()
      const g = (p.gramatura ?? '').toLowerCase()
      if (!n.includes(c.match.toLowerCase())) return false
      if (!g.includes(c.gram.toLowerCase())) return false
      if (c.exclude && c.exclude.some((k) => n.includes(k.toLowerCase()))) return false
      return true
    }) as Array<{ id: string; name: string; gramatura: string }>

    if (cands.length === 0) {
      zeroMatch.push(c)
      console.log(`[Lp ${c.lp.toString().padStart(2)}] ✗ NO MATCH — match="${c.match}" gram="${c.gram}"`)
      continue
    }
    if (cands.length > 1) {
      ambiguous.push({ item: c, cands })
      console.log(`[Lp ${c.lp.toString().padStart(2)}] ⚠ AMBIGUOUS (${cands.length}): ${cands.map((p) => `[${p.id.slice(0, 8)}] ${p.name}`).join(' || ')}`)
      continue
    }

    const target = cands[0]
    const { error: updErr } = await supabase
      .from('products')
      .update({
        display_name: c.display,
        price_maly_opt: c.p_m,
        price_sredni: c.p_s,
        price_duzy: c.p_d,
        show_in_orders: true,
        order_form_sort: c.lp,
        // Note: products table має тільки created_at + last_analyzed_at,
        // no updated_at column. Skip stamp.
      })
      .eq('id', target.id)
    if (updErr) {
      console.log(`[Lp ${c.lp.toString().padStart(2)}] ✗ UPDATE FAILED [${target.id.slice(0, 8)}] — ${updErr.message}`)
      continue
    }
    updated++
    console.log(`[Lp ${c.lp.toString().padStart(2)}] ✓ UPDATED [${target.id.slice(0, 8)}] | ${target.name} (${target.gramatura}) | display="${c.display}" | ${c.p_m}/${c.p_s}/${c.p_d}`)
  }

  console.log(`\n=== Summary ===`)
  console.log(`Total CENNIK_V9: ${CENNIK_V9.length}`)
  console.log(`Updated: ${updated}/${CENNIK_V9.length}`)
  console.log(`Zero match: ${zeroMatch.length} — ${zeroMatch.map((c) => 'Lp' + c.lp).join(', ') || 'none'}`)
  console.log(`Ambiguous: ${ambiguous.length} — ${ambiguous.map((a) => 'Lp' + a.item.lp).join(', ') || 'none'}`)

  // Verify: show_in_orders=TRUE count
  const { count, error: countErr } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('show_in_orders', true)
  if (!countErr) {
    console.log(`\nFinal: SELECT COUNT(*) FROM products WHERE show_in_orders=TRUE → ${count}`)
    console.log(`Expected: 17`)
  }

  // Sample 3 unmatched DB SKUs (show_in_orders=FALSE) для verify
  const { data: notInForm } = await supabase
    .from('products')
    .select('id, name, gramatura')
    .ilike('brand', '%czudow%')
    .eq('show_in_orders', false)
    .limit(3)
  console.log(`\nSample 3 SKUs з show_in_orders=FALSE (всього ${(czmProducts?.length ?? 0) - (count ?? 0)}):`)
  for (const p of notInForm ?? []) {
    console.log(`  [${p.id.slice(0, 8)}] ${p.name} (${p.gramatura})`)
  }

  if (zeroMatch.length > 0 || ambiguous.length > 0) {
    console.log(`\n⚠ Errors above — review matching keys у CENNIK_V9 array.`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Crashed:', err)
  process.exit(1)
})
