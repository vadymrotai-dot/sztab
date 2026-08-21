// app/api/fakturownia/warehouse-issue/route.ts — Ф2
// POST → ręczne wydanie WZ/RW (списання залишку). Auth required.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createManualIssue, type IssueInput } from '@/lib/orders/warehouse-issue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Zły format' }, { status: 400 })
  }

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ ok: false, error: 'Brak pozycji' }, { status: 400 })
  }

  const input: IssueInput = {
    clientId: body.client_id ?? null,
    issueDate: body.issue_date ?? null,
    description: body.description ?? null,
    lines: body.lines.map((l: any) => ({
      product_id: String(l.product_id),
      qty: Number(l.qty) || 0,
      price_net: l.price_net != null ? Number(l.price_net) : null,
    })),
  }

  try {
    const result = await createManualIssue(input)
    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Error' }, { status: 502 })
  }
}
