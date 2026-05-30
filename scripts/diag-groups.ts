/**
 * scripts/diag-groups.ts
 * Sprint T-ORDER.4a-DB STEP 3 (30.05.2026) — verify migracji 079.
 *
 * READ-ONLY. Wypisuje rozkład grupa × podgrupa + ile in_stock.
 *
 * Oczekiwane (po apply 079):
 *   czudowa_marka / kiszonki          → 8 SKU
 *   czudowa_marka / surowki           → 8 SKU
 *   czudowa_marka / warzywa_gotowane  → 1 SKU
 *   owoce_morza / kalmary             → 9 SKU (5 in_stock, 4 nie)
 *   owoce_morza / filety_rybne        → 6 SKU (4 in_stock, 2 nie)
 *
 * Uruchom: pnpm exec tsx scripts/diag-groups.ts
 *
 * Service-role z .env.local. RLS bypass.
 */

import '@/lib/env'

import { createAdminClient } from '@/lib/supabase/admin'

interface ProductRow {
  grupa: string | null
  podgrupa: string | null
  in_stock: boolean | null
  show_in_orders: boolean | null
}

async function main() {
  const admin = createAdminClient()

  console.log('=== T-ORDER.4a-DB STEP 3 — diag grupa × podgrupa ===\n')

  const { data: rows, error } = await admin
    .from('products')
    .select('grupa, podgrupa, in_stock, show_in_orders')

  if (error) {
    console.error('Błąd:', error.message)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('⚠️  Zero produktów.')
    process.exit(0)
  }

  // Aggregate
  const agg = new Map<
    string,
    { total: number; in_stock: number; show_in_orders: number }
  >()
  for (const r of rows as ProductRow[]) {
    const key = `${r.grupa ?? '(NULL)'} / ${r.podgrupa ?? '(NULL)'}`
    const prev = agg.get(key) ?? { total: 0, in_stock: 0, show_in_orders: 0 }
    prev.total++
    if (r.in_stock) prev.in_stock++
    if (r.show_in_orders) prev.show_in_orders++
    agg.set(key, prev)
  }

  console.log(
    `${'grupa / podgrupa'.padEnd(40)} | total | in_stock | show_in_orders`,
  )
  console.log('-'.repeat(85))

  // Sort: czudowa_marka first, then owoce_morza, then NULLs
  const order = (k: string) => {
    if (k.startsWith('czudowa_marka')) return 0
    if (k.startsWith('owoce_morza')) return 1
    return 2
  }
  const sorted = [...agg.entries()].sort((a, b) => {
    const oa = order(a[0])
    const ob = order(b[0])
    if (oa !== ob) return oa - ob
    return a[0].localeCompare(b[0])
  })

  let totalCM = 0,
    totalOM = 0
  for (const [key, v] of sorted) {
    console.log(
      `${key.padEnd(40)} | ${String(v.total).padStart(5)} | ${String(v.in_stock).padStart(8)} | ${String(v.show_in_orders).padStart(14)}`,
    )
    if (key.startsWith('czudowa_marka')) totalCM += v.total
    if (key.startsWith('owoce_morza')) totalOM += v.total
  }
  console.log('-'.repeat(85))
  console.log(`SUMA ЧМ: ${totalCM} (oczekiwane 17)`)
  console.log(`SUMA owoców morza: ${totalOM} (oczekiwane 15)`)

  // Sanity check oczekiwane
  const EXPECTED: Record<string, number> = {
    'czudowa_marka / kiszonki': 8,
    'czudowa_marka / surowki': 8,
    'czudowa_marka / warzywa_gotowane': 1,
    'owoce_morza / kalmary': 9,
    'owoce_morza / filety_rybne': 6,
  }

  let allOk = true
  console.log('\n── Verify oczekiwane ──')
  for (const [key, expCount] of Object.entries(EXPECTED)) {
    const actual = agg.get(key)?.total ?? 0
    const status = actual === expCount ? '✅' : '❌'
    if (actual !== expCount) allOk = false
    console.log(`  ${status} ${key.padEnd(38)} expected=${expCount} actual=${actual}`)
  }

  if (allOk) {
    console.log('\n✅ Migracja 079 zastosowana poprawnie.')
    process.exit(0)
  } else {
    console.log('\n❌ Niezgodności — sprawdź czy 079 została zaaplikowana.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Crash:', err)
  process.exit(1)
})
