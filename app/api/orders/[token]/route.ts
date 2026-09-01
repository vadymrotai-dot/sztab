// app/api/orders/[token]/route.ts
// GET /api/orders/[token] — public order draft loader.
// Logika wyekstrahowana do lib/orders/load-order-initial.ts (współdzielona z
// portalem klienta, który woła loader bezpośrednio, bez self-HTTP-fetch).
// NO auth check — authorization via access_token UUID w URL.

import { NextRequest, NextResponse } from 'next/server'
import { loadOrderInitial } from '@/lib/orders/load-order-initial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ token: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { token } = await ctx.params
  const { status, body } = await loadOrderInitial(token)
  return NextResponse.json(body, { status })
}
