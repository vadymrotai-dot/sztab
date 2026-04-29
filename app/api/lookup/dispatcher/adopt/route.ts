// app/api/lookup/dispatcher/adopt/route.ts
// Sprint O Phase 6 — accept candidate from dispatcher search → create
// clients row → trigger /api/intelligence/lookup в background.

import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface CandidatePayload {
  type: 'existing_client' | 'existing_prospect' | 'gus_fresh' | 'manual'
  id?: string
  nip?: string
  raw?: { legal_name?: string | null }
}

interface Candidate {
  source: string
  name: string
  nip: string | null
  city: string | null
  legal_form: string | null
  payload: CandidatePayload
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 })

  let body: { candidate?: Candidate } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }
  const c = body.candidate
  if (!c) return NextResponse.json({ ok: false, error: 'candidate required' }, { status: 400 })

  // Existing client → straight redirect
  if (c.payload.type === 'existing_client' && c.payload.id) {
    return NextResponse.json({ ok: true, redirect: `/clients/${c.payload.id}` })
  }
  // Existing prospect → redirect до prospect detail
  if (c.payload.type === 'existing_prospect' && c.payload.id) {
    return NextResponse.json({ ok: true, redirect: `/prospects/${c.payload.id}` })
  }

  // GUS fresh / manual → create new client row
  if (c.payload.type === 'gus_fresh' || c.payload.type === 'manual') {
    const nip = c.nip ?? c.payload.nip ?? null
    const title = c.name || c.payload.raw?.legal_name || `Firma ${nip ?? 'manual'}`

    const { data: insErr } = await supabase
      .from('clients')
      .insert({
        title,
        nip,
        status: 'nowy',
        segment: 'niesklasyfikowany',
        owner_id: user.id,
      })
      .select('id')
      .single()
    const newRow = insErr as { id: string } | null
    if (!newRow?.id) {
      return NextResponse.json(
        { ok: false, error: 'Nie udało się utworzyć klienta' },
        { status: 500 },
      )
    }

    // Trigger full intelligence lookup у background
    if (nip) {
      after(async () => {
        try {
          const origin =
            req.headers.get('origin') ?? `https://${req.headers.get('host') ?? 'localhost'}`
          await fetch(`${origin}/api/intelligence/lookup`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              cookie: req.headers.get('cookie') ?? '',
            },
            body: JSON.stringify({ nip }),
          })
        } catch (err) {
          console.error('[adopt] background lookup failed:', err)
        }
      })
    }

    return NextResponse.json({ ok: true, redirect: `/clients/${newRow.id}` })
  }

  return NextResponse.json({ ok: false, error: 'unknown candidate type' }, { status: 400 })
}
