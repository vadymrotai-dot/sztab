// app/api/clients/bulk-refresh/route.ts
// Sprint S4 Phase 2D — bulk "Pobierz z KRS" для wybranych klientów.
// Wraps /api/intelligence/lookup in batch. Cap 3 firm per call (lookup
// jest ciężki — 6-step pipeline ~1-2 min každdy). Caller iteruje по
// batches > 3 jeśli potrzebują więcej.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_CAP = 3

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 })
  }

  let body: { ids?: string[] } = {}
  try {
    body = (await req.json()) as { ids?: string[] }
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }
  const ids = (body.ids ?? []).slice(0, BATCH_CAP)
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'ids required' }, { status: 400 })
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('id, nip')
    .in('id', ids)

  const rows = (clients ?? []) as Array<{ id: string; nip: string | null }>
  let succeeded = 0
  let failed = 0
  let skipped = 0
  const errors: Array<{ id: string; error: string }> = []

  // Forward cookies dla SSR auth context na internal lookup call.
  const cookieHeader = req.headers.get('cookie') ?? ''
  const origin = new URL(req.url).origin

  for (const row of rows) {
    if (!row.nip) {
      skipped += 1
      continue
    }
    try {
      const res = await fetch(`${origin}/api/intelligence/lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: cookieHeader,
        },
        body: JSON.stringify({ nip: row.nip }),
      })
      if (res.ok) {
        succeeded += 1
      } else {
        failed += 1
        const text = await res.text().catch(() => '')
        errors.push({ id: row.id, error: `${res.status}: ${text.slice(0, 100)}` })
      }
    } catch (e) {
      failed += 1
      errors.push({ id: row.id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ ok: true, succeeded, failed, skipped, errors })
}
