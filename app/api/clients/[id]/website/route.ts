// app/api/clients/[id]/website/route.ts
// Sprint S-MENU Day 3 (15.05.2026) — Manual website override endpoint.
//
// POST body: { url: string }
// - Validates URL via `new URL(url)` (throws якщо malformed)
// - Auto-prefixes 'https://' якщо schema missing (так Vadym може typi "kemerkebab.pl")
// - Strips trailing slashes, query params for canonical form
// - Upserts company_profile_fields[website] з source='manual_override' (priority 5)
//   — supersedes ALL automated sources (tavily=1, tavily_brand=2, Apify=4, WWW=4)
// - Returns { ok, website_url } on success
//
// Why this exists: Tavily picks aggregator domains (monitorfirm.pb.pl, yelp.com)
// для many JDG-gastronomy clients. CEIDG не зберігає website. Brand-aware Tavily
// re-query (STEP 6.6) catches більшість, але edge cases need Vadym manual fix.
//
// Companion endpoint: /api/clients/[id]/full-analysis — UI calls це окремо після
// website save (sequential POSTs) when user clicks "Zapisz i przeanalizuj".

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { upsertFields } from '@/lib/profile/merge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  url: string
}

function normalizeUrl(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null
  let cleaned = raw.trim()
  if (cleaned.length === 0) return null
  // Auto-prefix https:// якщо немає schema
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'https://' + cleaned
  }
  try {
    const u = new URL(cleaned)
    // Validate host has dot (avoid 'https://localhost' / 'https://abc')
    if (!u.hostname.includes('.')) return null
    // Strip path/query/hash — keep tylko protocol://host
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

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

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Niepoprawny JSON body' }, { status: 400 })
  }
  if (!body?.url || typeof body.url !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'Pole `url` jest wymagane (string)' },
      { status: 400 },
    )
  }

  const normalized = normalizeUrl(body.url)
  if (!normalized) {
    return NextResponse.json(
      {
        ok: false,
        error: `Niepoprawny URL: "${body.url.slice(0, 80)}". Wprowadź pełny adres (np. https://kemerkebab.pl).`,
      },
      { status: 400 },
    )
  }

  // Verify client exists
  const { data: clientRow, error: cliErr } = await supabase
    .from('clients')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (cliErr) {
    return NextResponse.json(
      { ok: false, error: `Błąd DB: ${cliErr.message}` },
      { status: 500 },
    )
  }
  if (!clientRow) {
    return NextResponse.json({ ok: false, error: 'Klient nie istnieje' }, { status: 404 })
  }

  // Upsert with manual_override priority 5 — supersedes all automated sources
  try {
    await upsertFields(
      supabase,
      { type: 'client', id },
      [{ field_key: 'website', value: { value_text: normalized } }],
      'manual_override',
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, error: `upsertFields failed: ${msg}` },
      { status: 500 },
    )
  }

  // Sprint S-MENU Day 3 — also mirror до clients.website canonical column
  // (Day 2 query reads це у `gatherCompanyContext` AI ctx + UI Contact section).
  // Без mirror — UI bude show stale OLD aggregator URL jacking-stale.
  try {
    await supabase.from('clients').update({ website: normalized }).eq('id', id)
  } catch (err) {
    // non-fatal — primary write (company_profile_fields) succeeded
    console.warn('[website POST] mirror to clients.website failed:', err)
  }

  return NextResponse.json({
    ok: true,
    website_url: normalized,
    source: 'manual_override',
  })
}
