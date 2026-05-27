#!/usr/bin/env tsx
// scripts/seed-hurt-wh-prices.ts
// Sprint S-CENNIK-WH.2 (26.05.2026) — seed products.price_hurt_wh entry-tier
// для wielki_hurt + auto matrix cell (Hurt < 10k threshold).
//
// Data source: PDF Hurt 2026 (inline below).
//
// Match strategy (post Issue 1 fix):
//   display_name EXACT equality + gramatura ILIKE pattern
//   Safety: jeśli query zwraca > 1 row → STOP з error
//
// Known DB gap: Kapusta kiszona 900g — SKU nie istnieje w products. PDF row
// pomijamy. Vadym decide later (S-PRODUCTS-FILL-GAPS micro-sprint).
//
// Idempotent: re-run = same values re-applied.
//
// CLI:
//   pnpm exec tsx scripts/seed-hurt-wh-prices.ts
//
// Note: sandbox tsx blocked (Protocol 31) — actual execution через Python+REST.
//       This TS file kept як canonical source-of-truth + reference dla future re-runs.

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'

// 16 PDF rows; 15 SKU exist в DB. "Kapusta kiszona 900g" pominięta (DB gap, see header).
const HURT_PRICES: Array<{
  display_name: string // exact match z DB
  gramaturaLike: string // ILIKE pattern (DB has '3000 g' з space, PDF '3000g' bez)
  price_hurt_wh: number
}> = [
  { display_name: 'Kapusta kiszona', gramaturaLike: '%3000%', price_hurt_wh: 11.01 },
  // 'Kapusta kiszona 900g' SKU nie istnieje w DB — pomijamy. Known gap.
  { display_name: 'Kapusta kiszona z żurawiną', gramaturaLike: '%3000%', price_hurt_wh: 13.41 },
  { display_name: 'Kapusta kiszona z papryką słodką', gramaturaLike: '%3000%', price_hurt_wh: 13.41 },
  { display_name: 'Kapusta kiszona z ogórkami', gramaturaLike: '%3000%', price_hurt_wh: 13.41 },
  { display_name: 'Świeża kapusta w marynacie', gramaturaLike: '%3000%', price_hurt_wh: 28.90 },
  { display_name: 'Kapusta z burakami w marynacie', gramaturaLike: '%3000%', price_hurt_wh: 21.33 },
  { display_name: 'Pełuska — kapusta w marynacie buraczanej', gramaturaLike: '%3000%', price_hurt_wh: 15.83 },
  { display_name: 'Tradycyjna — kapusta, marchew, papryka', gramaturaLike: '%3000%', price_hurt_wh: 23.05 },
  { display_name: 'Tradycyjna — kapusta, marchew, papryka', gramaturaLike: '%900%', price_hurt_wh: 7.15 },
  { display_name: 'Marchewka po koreańsku', gramaturaLike: '%3000%', price_hurt_wh: 23.05 },
  { display_name: 'Marchewka po koreańsku', gramaturaLike: '%900%', price_hurt_wh: 5.71 },
  { display_name: 'Sałatka z buraków czerwonych', gramaturaLike: '%3000%', price_hurt_wh: 24.21 },
  { display_name: 'Buraki gotowane sterylizowane', gramaturaLike: '%1500%', price_hurt_wh: 9.84 },
  { display_name: 'Ogórki kiszone — wiadro 5L', gramaturaLike: '%5000%', price_hurt_wh: 25.80 },
  { display_name: 'Ogórki kiszone — słoik 1L', gramaturaLike: '%1000%', price_hurt_wh: 4.96 },
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
    process.exit(1)
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let updates = 0
  const errors: string[] = []

  for (const item of HURT_PRICES) {
    // Exact display_name + ILIKE gramatura
    const { data, error } = await supabase
      .from('products')
      .update({ price_hurt_wh: item.price_hurt_wh })
      .eq('display_name', item.display_name)
      .ilike('gramatura', item.gramaturaLike)
      .select('id, display_name, gramatura, price_hurt_wh')
    if (error) {
      errors.push(`ERROR "${item.display_name}" ${item.gramaturaLike}: ${error.message}`)
      continue
    }
    if (!data || data.length === 0) {
      errors.push(`NO MATCH: "${item.display_name}" ${item.gramaturaLike}`)
      continue
    }
    if (data.length > 1) {
      // Safety: > 1 row dla pojedynczej PDF entry = ambiguous. STOP.
      errors.push(`MULTI MATCH (${data.length}): "${item.display_name}" ${item.gramaturaLike} — STOP`)
      data.forEach((d) => errors.push(`  ${d.display_name} ${d.gramatura}`))
      continue
    }
    console.log(`✓ ${data[0].display_name} ${data[0].gramatura}: ${item.price_hurt_wh}`)
    updates += 1
  }

  console.log(`\n=== SUMMARY ===`)
  console.log(`Updates: ${updates} / ${HURT_PRICES.length}`)
  if (errors.length > 0) {
    console.error('\nErrors / unmatched:')
    errors.forEach((e) => console.error(`  ${e}`))
    process.exit(1)
  }
  console.log('Clean — no multi-match, no unmatched.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
