// app/api/nip-lookup/route.ts
// Server-side NIP lookup przez rejestr MF. Logika w lib/nip/mf-lookup.ts
// (współdzielona z akcją portalu). Ten route to cienki wrapper HTTP.

import { NextResponse } from 'next/server'
import { lookupNipMF } from '@/lib/nip/mf-lookup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const r = await lookupNipMF(String(body?.nip || ''))
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status })
  }
  return NextResponse.json({ ok: true, data: r.data })
}
