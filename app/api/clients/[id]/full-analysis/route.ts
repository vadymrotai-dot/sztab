// app/api/clients/[id]/full-analysis/route.ts
// Sprint S6A Step 1 — wrapper endpoint dla "Analiza klienta" primary CTA
// (Protocol 13 — Two Fundamental Analysis Buttons).
//
// Mechanika:
//   1. Resolve clientId → NIP z tabeli clients
//   2. Forward POST do /api/intelligence/lookup (Phase A sync + Phase B
//      przez after()) z forwardingiem cookies dla auth (supabase.auth.getUser
//      czyta JWT z cookies, nie Authorization Bearer).
//   3. Zwraca envelope as-is (Q-2 lock): { ok, response, phase, enrichment_pending }
//      — caller widzi LookupResponse w polu response wraz z phase_b_pending.
//
// Architecture decision (Q-arch lock 02.05.2026): Option A (internal fetch
// wrapper). Minimalny blast radius dla pierwszego commitu S6A. Ekstrakcja do
// lib/intelligence/pipeline.ts (Option B) — future cleanup gdy zajdzie potrzeba
// reuse z innych routes.
//
// maxDuration = 120 — align z /api/intelligence/lookup ceiling. Phase A wraca
// w ~10-30s, Phase B kontynuuje w tle przez after() do 120s.
//
// AI_match_rescore w phase_b_pending — TODO Step 2 (refactor lookup/route.ts
// do augmentowania pending list o AI rescore + dodanie kroku w runPhaseB).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(
  req: Request,
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
    return NextResponse.json({ ok: false, error: 'Niepoprawny client id' }, { status: 400 })
  }

  // 1. Resolve client → NIP
  const { data: clientRow } = await supabase
    .from('clients')
    .select('id, nip, title')
    .eq('id', id)
    .maybeSingle()
  const client = clientRow as { id: string; nip: string | null; title: string | null } | null

  if (!client) {
    return NextResponse.json(
      { ok: false, error: 'Klient nie istnieje' },
      { status: 404 },
    )
  }
  if (!client.nip) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Brak NIP w tym kliencie. Uzupełnij NIP w profilu klienta przed uruchomieniem analizy.',
      },
      { status: 400 },
    )
  }

  // 2. Forward do /api/intelligence/lookup z cookie forwardingiem
  // (supabase auth czyta JWT z cookies; bez forwardingu internal call ide
  // unauthenticated → 401).
  const cookieHeader = req.headers.get('cookie') ?? ''
  const origin = new URL(req.url).origin

  const lookupResponse = await fetch(
    `${origin}/api/intelligence/lookup`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: cookieHeader,
      },
      body: JSON.stringify({ nip: client.nip }),
    },
  )

  // 3. Forward envelope as-is (Q-2 lock — zachowujemy phase / enrichment_pending
  // razem z response.phase_b_pending). Caller dostaje:
  //   { ok: true, response: {...LookupResponse...}, phase: 'A_complete', enrichment_pending: true }
  // lub error envelope gdy lookup zwrocil 4xx/5xx.
  const data: unknown = await lookupResponse.json().catch(() => ({
    ok: false,
    error: 'Niepoprawna odpowiedz z /api/intelligence/lookup',
  }))

  return NextResponse.json(data, { status: lookupResponse.status })
}
