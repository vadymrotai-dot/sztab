/**
 * scripts/diag-hidden-cm.ts
 * Sprint T-ORDER.4a-DB diag (30.05.2026) — wszystkie 32 SKU czudowa_marka.
 *
 * READ-ONLY. Console only.
 *
 * Cel: ocenić czy ukryte SKU to duplikaty czy różne opakowania
 * (porównanie name+gramatura+price visible vs hidden).
 *
 * SELECT name, display_name, gramatura, category, show_in_orders,
 *        price_maly_opt, price_sredni, price_duzy
 * FROM products
 * WHERE grupa='czudowa_marka'
 * ORDER BY category, display_name, show_in_orders DESC.
 *
 * Uruchom: pnpm exec tsx scripts/diag-hidden-cm.ts
 */

import '@/lib/env'

import { createAdminClient } from '@/lib/supabase/admin'

async function main() {
  const admin = createAdminClient()

  console.log('=== diag-hidden-cm — wszystkie SKU czudowa_marka ===\n')

  const { data: rows, error } = await admin
    .from('products')
    .select(
      'name, display_name, gramatura, category, show_in_orders, price_maly_opt, price_sredni, price_duzy',
    )
    .eq('grupa', 'czudowa_marka')
    .order('category', { ascending: true })
    .order('display_name', { ascending: true })
    .order('show_in_orders', { ascending: false })

  if (error) {
    console.error('Błąd:', error.message)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('(brak SKU)')
    process.exit(0)
  }

  console.log(`Total czudowa_marka: ${rows.length}\n`)

  let currentCat: string | null | undefined = undefined
  for (const r of rows) {
    if (r.category !== currentCat) {
      currentCat = r.category
      console.log(`\n── category: ${currentCat ?? '(NULL)'} ──`)
      console.log(
        `${'show'.padEnd(5)} | ${'gramatura'.padEnd(16)} | ${'maly'.padStart(6)} | ${'sredni'.padStart(6)} | ${'duzy'.padStart(6)} | name / display_name`,
      )
      console.log('-'.repeat(115))
    }
    const show = r.show_in_orders ? '✓' : '✗'
    const dn = r.display_name || r.name
    const gram = (r.gramatura ?? '-').slice(0, 16)
    const maly = r.price_maly_opt != null ? String(r.price_maly_opt) : '-'
    const sredni = r.price_sredni != null ? String(r.price_sredni) : '-'
    const duzy = r.price_duzy != null ? String(r.price_duzy) : '-'
    console.log(
      `${show.padEnd(5)} | ${gram.padEnd(16)} | ${maly.padStart(6)} | ${sredni.padStart(6)} | ${duzy.padStart(6)} | ${dn}`,
    )
  }
}

main().catch((err) => {
  console.error('Crash:', err)
  process.exit(1)
})
