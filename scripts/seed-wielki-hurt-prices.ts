#!/usr/bin/env tsx
// scripts/seed-wielki-hurt-prices.ts
// Sprint S-CENNIK-WH.1 (26.05.2026) — re-seed products.price_duzi_gracze
// з Cennik Wielki Hurt 2026 PDF Vadym. Fuzzy match by name+gramatura.
//
// CLI:
//   pnpm dlx tsx scripts/seed-wielki-hurt-prices.ts [--dry]
//
// 16 SKU mapped per Vadym brief. Pomidory excluded (not sold WH).

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'

interface WhItem {
  // substring match key for products.name (case-insensitive)
  nameKey: string
  // substring match key for products.gramatura
  gramKey: string
  // Wielki Hurt price (lower than duży expected)
  wh: number
  // Optional exclude tokens to reject false matches
  exclude?: string[]
}

const WH_PRICES: WhItem[] = [
  { nameKey: 'kapusta kiszona', gramKey: '3000', wh: 10.28,
    exclude: ['żurawiną', 'papryką', 'ogórkami', 'marynacie', 'burakami'] },
  // 900g pure kapusta kiszona — not in current 17-SKU cennik v9 (had only 3000g),
  // but PDF lists. Skip mapping if no DB match; report unmatched.
  { nameKey: 'kapusta kiszona', gramKey: '900', wh: 6.93,
    exclude: ['żurawiną', 'papryką', 'ogórkami', 'marynacie', 'burakami'] },
  { nameKey: 'kapusta kiszona z żurawiną', gramKey: '3000', wh: 12.52 },
  { nameKey: 'kapusta kiszona z papryką', gramKey: '3000', wh: 12.52 },
  { nameKey: 'kapusta kiszona z ogórkami', gramKey: '3000', wh: 12.52 },
  { nameKey: 'świeżej kapusty w marynacie', gramKey: '3000', wh: 26.97 },
  { nameKey: 'kapusta z burakami', gramKey: '3000', wh: 19.91 },
  { nameKey: 'pełuska', gramKey: '3000', wh: 14.77 },
  { nameKey: 'tradycyjna', gramKey: '3000', wh: 21.51,
    exclude: ['marchwi', 'pełuska', 'burakami', 'żurawiną'] },
  { nameKey: 'tradycyjna', gramKey: '900', wh: 6.68,
    exclude: ['marchwi', 'pełuska', 'burakami', 'żurawiną'] },
  { nameKey: 'marchwi po koreańsku', gramKey: '3000', wh: 21.51 },
  { nameKey: 'marchwi po koreańsku', gramKey: '900', wh: 5.33 },
  { nameKey: 'sałatka z buraków', gramKey: '3000', wh: 22.60 },
  { nameKey: 'buraki gotowane', gramKey: '1500', wh: 8.61 },
  { nameKey: 'ogórki kiszone', gramKey: '5000', wh: 24.08 },
  { nameKey: 'ogórki kiszone', gramKey: '1000', wh: 4.62 },
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const dry = process.argv.includes('--dry')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  console.log(`Sprint S-CENNIK-WH.1 — re-seed price_duzi_gracze (Wielki Hurt)`)
  console.log(`Mode: ${dry ? 'DRY-RUN' : 'APPLY'}\n`)

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, gramatura, brand, price_duzy, price_duzi_gracze')
    .ilike('brand', '%czudow%')
    .limit(200)
  if (error) {
    console.error('Fetch products failed:', error.message)
    process.exit(1)
  }

  let matched = 0
  const unmatched: WhItem[] = []
  const ambiguous: { item: WhItem; cands: any[] }[] = []

  for (const item of WH_PRICES) {
    const cands = (products ?? []).filter((p: any) => {
      const n = (p.name ?? '').toLowerCase()
      const g = (p.gramatura ?? '').toLowerCase()
      if (!n.includes(item.nameKey.toLowerCase())) return false
      if (!g.includes(item.gramKey.toLowerCase())) return false
      if (item.exclude && item.exclude.some((k) => n.includes(k.toLowerCase()))) return false
      return true
    })

    if (cands.length === 0) { unmatched.push(item); continue }
    if (cands.length > 1) { ambiguous.push({ item, cands }); continue }

    const target: any = cands[0]
    const oldPrice = target.price_duzi_gracze
    if (!dry) {
      const { error: updErr } = await supabase
        .from('products')
        .update({ price_duzi_gracze: item.wh })
        .eq('id', target.id)
      if (updErr) {
        console.error(`  ✗ UPDATE ${target.id.slice(0,8)} failed: ${updErr.message}`)
        continue
      }
    }
    matched++
    console.log(`  ✓ ${target.id.slice(0,8)} | ${target.name.slice(0,50)} (${target.gramatura}) | ${oldPrice} → ${item.wh}`)
  }

  console.log(`\n=== Summary ===`)
  console.log(`Matched: ${matched}/${WH_PRICES.length}`)
  console.log(`Unmatched: ${unmatched.length} — ${unmatched.map(u => `${u.nameKey}/${u.gramKey}`).join(', ') || 'none'}`)
  console.log(`Ambiguous: ${ambiguous.length} — ${ambiguous.map(a => `${a.item.nameKey}/${a.item.gramKey} (${a.cands.length})`).join(', ') || 'none'}`)

  if (unmatched.length > 0 || ambiguous.length > 0) {
    console.log(`\n⚠ Issues found — review keys.`)
    process.exit(1)
  }
}
main().catch(err => { console.error('Crashed:', err); process.exit(1) })
