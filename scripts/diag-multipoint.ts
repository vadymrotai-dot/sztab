/**
 * scripts/diag-multipoint.ts
 * Sprint T-ORDER.3 STEP 3 (30.05.2026) — verify migracji 078.
 *
 * READ-ONLY — nic nie zapisuje. Sprawdza:
 *   - orders ma kolumny delivery_mode + documents_mode
 *   - order_items ma delivery_point_id + unit_snapshot
 *   - 4 nowe tabele istnieją: order_delivery_points, client_delivery_points,
 *     order_documents, order_templates
 *   - liczba wierszy w każdej nowej tabeli (powinno być 0)
 *
 * Uruchom: pnpm exec tsx scripts/diag-multipoint.ts
 *
 * Service-role z .env.local (admin). RLS bypass.
 */

import '@/lib/env'

import { createAdminClient } from '@/lib/supabase/admin'

interface ColumnCheck {
  table: string
  column: string
}

interface TableCheck {
  table: string
}

const COLUMN_CHECKS: ColumnCheck[] = [
  { table: 'orders', column: 'delivery_mode' },
  { table: 'orders', column: 'documents_mode' },
  { table: 'order_items', column: 'delivery_point_id' },
  { table: 'order_items', column: 'unit_snapshot' },
]

const TABLE_CHECKS: TableCheck[] = [
  { table: 'order_delivery_points' },
  { table: 'client_delivery_points' },
  { table: 'order_documents' },
  { table: 'order_templates' },
]

async function main() {
  const admin = createAdminClient()

  console.log('=== T-ORDER.3 STEP 3 — diag migracji 078 ===\n')

  let allOk = true

  // 1. Verify columns na orders + order_items
  console.log('── Kolumny (ALTER) ─────────────────')
  for (const c of COLUMN_CHECKS) {
    // PostgREST: try select tej kolumny z limit 0 — błąd 42703 jeśli nie istnieje.
    const { error } = await admin.from(c.table).select(c.column).limit(0)
    if (error) {
      console.log(`  ❌ ${c.table}.${c.column} — ${error.code} ${error.message}`)
      allOk = false
    } else {
      console.log(`  ✅ ${c.table}.${c.column}`)
    }
  }

  // 2. Verify że nowe tabele istnieją + liczba wierszy
  console.log('\n── Nowe tabele (CREATE) + count ───')
  for (const t of TABLE_CHECKS) {
    const { count, error } = await admin
      .from(t.table)
      .select('*', { count: 'exact', head: true })
    if (error) {
      console.log(`  ❌ ${t.table} — ${error.code} ${error.message}`)
      allOk = false
    } else {
      console.log(`  ✅ ${t.table} — ${count ?? 0} rows`)
    }
  }

  console.log()
  if (allOk) {
    console.log('✅ Wszystko OK — migracja 078 zastosowana poprawnie.')
    process.exit(0)
  } else {
    console.log('❌ Wykryto problemy — sprawdź czy migracja 078 została zaaplikowana.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Crash:', err)
  process.exit(1)
})
