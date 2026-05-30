/**
 * scripts/diag-submit-multipoint.ts
 * Sprint T-ORDER.4b-API diag (30.05.2026) — verify że submit nadal działa
 * back-compat (stare zamówienia bez delivery_points) i przygotuj baseline
 * przed 4b-UI.
 *
 * READ-ONLY. Console only.
 *
 * Dla ostatnich 3 SUBMITTED zamówień pokazuje:
 *   - order_number, status, delivery_mode, documents_mode
 *   - liczba order_delivery_points
 *   - liczba order_items + ile ma delivery_point_id NOT NULL
 *
 * Stare zamówienia po deployu 4b-API muszą pokazać:
 *   delivery_mode='jeden', documents_mode='wspolna', dp=0, items_with_dpid=0.
 * To dowodzi że back-compat OK.
 *
 * Uruchom: pnpm exec tsx scripts/diag-submit-multipoint.ts
 */

import '@/lib/env'

import { createAdminClient } from '@/lib/supabase/admin'

async function main() {
  const admin = createAdminClient()

  console.log('=== diag-submit-multipoint — ostatnie 3 SUBMITTED ===\n')

  const { data: orders, error } = await admin
    .from('orders')
    .select(
      'id, order_number, status, delivery_mode, documents_mode, submitted_at, delivery_address',
    )
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(3)

  if (error) {
    console.error('Błąd:', error.message)
    process.exit(1)
  }

  if (!orders || orders.length === 0) {
    console.log('(brak submitted orders)')
    process.exit(0)
  }

  for (const o of orders) {
    console.log(`── ${o.order_number ?? '(no number)'} ──`)
    console.log(`  status:         ${o.status}`)
    console.log(`  delivery_mode:  ${o.delivery_mode ?? '(NULL)'}`)
    console.log(`  documents_mode: ${o.documents_mode ?? '(NULL)'}`)
    console.log(`  submitted_at:   ${o.submitted_at ?? '(NULL)'}`)
    console.log(
      `  delivery_address: ${o.delivery_address ? o.delivery_address.slice(0, 60) : '(NULL)'}`,
    )

    const { count: dpCount, error: dpErr } = await admin
      .from('order_delivery_points')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', o.id)
    if (dpErr) {
      console.error('  dp count error:', dpErr.message)
    } else {
      console.log(`  delivery_points: ${dpCount ?? 0}`)
    }

    const { count: itemsTotal } = await admin
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', o.id)

    const { count: itemsWithDp } = await admin
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', o.id)
      .not('delivery_point_id', 'is', null)

    console.log(
      `  order_items:     ${itemsTotal ?? 0} total, ${itemsWithDp ?? 0} z delivery_point_id`,
    )
    console.log('')
  }

  console.log(
    '\nOczekiwane post-4b-API-deploy bez 4b-UI: wszystkie stare mają mode=jeden/wspolna, dp=0, items_with_dpid=0.',
  )
}

main().catch((err) => {
  console.error('Crash:', err)
  process.exit(1)
})
