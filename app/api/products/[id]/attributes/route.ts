// app/api/products/[id]/attributes/route.ts
// GET /api/products/{id}/attributes
// Returns merged attribute view — Family defaults + SKU overrides + hygiene
// status. Read-only.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveProductAttributes } from '@/lib/product-attributes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny product id' },
      { status: 400 },
    )
  }

  try {
    const data = await resolveProductAttributes(supabase, id)
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 404 })
  }
}
