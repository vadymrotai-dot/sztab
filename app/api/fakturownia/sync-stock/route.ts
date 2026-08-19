// app/api/fakturownia/sync-stock/route.ts — Ф1
// POST → читає stock_level зі складу Fakturownia → products.stock_level +
// stock_synced_at (матч по code = Sztab id). Auth required.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncStockFromFakturownia } from '@/lib/orders/fakturownia-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  try {
    const result = await syncStockFromFakturownia()
    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Sync error' },
      { status: 502 },
    )
  }
}
