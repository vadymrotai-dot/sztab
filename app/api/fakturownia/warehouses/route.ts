// app/api/fakturownia/warehouses/route.ts — Ф1
// GET /api/fakturownia/warehouses → lista magazynów (заодно перевірка модуля).
// Auth required (cookies session). Використай, щоб дізнатись warehouse_id.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listWarehouses } from '@/lib/integrations/fakturownia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  try {
    const warehouses = await listWarehouses()
    return NextResponse.json({ ok: true, warehouses })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Fakturownia error' },
      { status: 502 },
    )
  }
}
