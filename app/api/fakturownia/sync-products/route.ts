// app/api/fakturownia/sync-products/route.ts — Ф1
// POST → push усіх show_in_orders товарів у Fakturownia (limited:1), зберегти
// fakturownia_product_id. Ідемпотентно. Auth required.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncProductsToFakturownia } from '@/lib/orders/fakturownia-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  try {
    const result = await syncProductsToFakturownia()
    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Sync error' },
      { status: 502 },
    )
  }
}
