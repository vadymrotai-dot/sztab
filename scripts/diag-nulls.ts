/**
 * scripts/diag-nulls.ts
 * Sprint T-ORDER.4a-DB diag (30.05.2026) — sprawdzenie NULL grupa + ukryte ЧМ.
 *
 * READ-ONLY. Console only.
 *
 * Wypisuje:
 *   1. Produkty z grupa IS NULL — id, name, display_name, category, show_in_orders
 *   2. Produkty ЧМ z show_in_orders=FALSE — count per category
 *
 * Uruchom: pnpm exec tsx scripts/diag-nulls.ts
 */

import '@/lib/env'

import { createAdminClient } from '@/lib/supabase/admin'

async function main() {
  const admin = createAdminClient()

  console.log('=== diag-nulls — produkty bez grupy + ukryte ЧМ ===\n')

  // 1. grupa IS NULL
  const { data: nullRows, error: e1 } = await admin
    .from('products')
    .select('id, name, display_name, category, show_in_orders')
    .is('grupa', null)
    .order('show_in_orders', { ascending: false })

  if (e1) {
    console.error('Błąd #1:', e1.message)
    process.exit(1)
  }

  console.log(`── 1. Produkty z grupa IS NULL: ${nullRows?.length ?? 0} ──`)
  if (nullRows && nullRows.length > 0) {
    console.log(
      `${'show_orders'.padEnd(12)} | ${'id (8)'.padEnd(10)} | ${'category'.padEnd(24)} | name / display_name`,
    )
    console.log('-'.repeat(120))
    for (const r of nullRows) {
      const showOrders = r.show_in_orders ? 'TRUE' : 'FALSE'
      const id8 = (r.id as string).slice(0, 8)
      const cat = (r.category ?? '(NULL)').slice(0, 24)
      const dn = r.display_name || r.name
      console.log(
        `${showOrders.padEnd(12)} | ${id8.padEnd(10)} | ${cat.padEnd(24)} | ${dn}`,
      )
    }
  } else {
    console.log('(brak SKU z grupa=NULL)')
  }

  // 2. ЧМ z show_in_orders=FALSE — count per category
  const { data: hiddenCM, error: e2 } = await admin
    .from('products')
    .select('category')
    .eq('grupa', 'czudowa_marka')
    .eq('show_in_orders', false)

  if (e2) {
    console.error('Błąd #2:', e2.message)
    process.exit(1)
  }

  console.log(
    `\n── 2. ЧМ ukryte (show_in_orders=FALSE) per category: ${hiddenCM?.length ?? 0} SKU ──`,
  )
  if (hiddenCM && hiddenCM.length > 0) {
    const agg = new Map<string, number>()
    for (const r of hiddenCM) {
      const cat = r.category ?? '(NULL)'
      agg.set(cat, (agg.get(cat) ?? 0) + 1)
    }
    for (const [cat, n] of [...agg.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat.padEnd(30)} count=${n}`)
    }
  } else {
    console.log('(zero ukrytych ЧМ)')
  }
}

main().catch((err) => {
  console.error('Crash:', err)
  process.exit(1)
})
