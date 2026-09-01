// app/api/orders/[token]/cart/route.ts — autosave koszyka draftu.
// POST /api/orders/[token]/cart  body: { draft_cart: <serializowalny stan> }
//   - Zapisuje draft_cart TYLKO gdy order jest draft (status='draft').
//   - Guard WHERE status='draft' → autosave PO submit = no-op (0 rows),
//     nie nadpisze złożonego zamówienia (ochrona przed race'em).
//   - Service-role (order pod RLS Option B). Autoryzacja = access_token w URL.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ ok: false, error: 'Niepoprawny token' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({}))
  const draftCart = body?.draft_cart ?? null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('orders')
    .update({ draft_cart: draftCart })
    .eq('access_token', token)
    .eq('status', 'draft') // guard — nie dotykaj złożonych/anulowanych
    .select('id')

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  // data.length === 0 → order nie jest draft (np. już submitted) → no-op.
  return NextResponse.json({ ok: true, saved: (data?.length ?? 0) > 0 })
}
