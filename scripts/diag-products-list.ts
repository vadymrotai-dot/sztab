/**
 * scripts/diag-products-list.ts
 * Sprint T-ORDER.4a-DB STEP 0 (30.05.2026) — pełna lista SKU show_in_orders=true.
 *
 * READ-ONLY — nic nie zapisuje. Wypisuje:
 *   id, name, display_name, category, gramatura, order_form_sort, show_in_orders
 *   posortowane wg category, potem order_form_sort.
 *
 * Cel: Vadym potwierdza mapowanie SKU → nowa hierarchia grupa/podgrupa
 * przed seedem migracji 079.
 *
 * Uruchom: pnpm exec tsx scripts/diag-products-list.ts
 *
 * Service-role z .env.local. RLS bypass.
 */

import '@/lib/env'

import { createAdminClient } from '@/lib/supabase/admin'

async function main() {
  const admin = createAdminClient()

  console.log('=== T-ORDER.4a-DB STEP 0 — lista SKU show_in_orders=true ===\n')

  const { data: rows, error } = await admin
    .from('products')
    .select(
      'id, name, display_name, category, gramatura, unit, order_form_sort, show_in_orders',
    )
    .eq('show_in_orders', true)
    .order('category', { ascending: true })
    .order('order_form_sort', { ascending: true })

  if (error) {
    console.error('Błąd:', error.message)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('⚠️  Zero SKU z show_in_orders=true.')
    process.exit(0)
  }

  console.log(`Total SKU: ${rows.length}\n`)
  console.log(
    'sort | id (8)   | category              | display_name (or name)                          | gramatura',
  )
  console.log('-'.repeat(125))
  for (const p of rows) {
    const dn = (p.display_name || p.name).slice(0, 48)
    const cat = (p.category ?? '(NULL)').slice(0, 22)
    const sort = String(p.order_form_sort ?? '-').padStart(4)
    const id8 = (p.id as string).slice(0, 8)
    const gram = p.gramatura ?? '-'
    console.log(`${sort} | ${id8} | ${cat.padEnd(22)} | ${dn.padEnd(48)} | ${gram}`)
  }
}

main().catch((err) => {
  console.error('Crash:', err)
  process.exit(1)
})
