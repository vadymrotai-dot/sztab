// app/api/products/[id]/matches/top/route.ts
// Sprint S-CORE.3.B (A+B pieces) — TOP 25 client matching з iterative
// exclusion (per Vadym 04.05).
//
// Flow:
//   1. Auth + UUID validate
//   2. SELECT contacted match_ids з product_match_runs WHERE product_id=X
//      (small set — usually < 25 per product у typical use)
//   3. SELECT matches WHERE product_id=X AND expires_at > now()
//      JOIN clients (target_type='client') AND ceidg_prospects
//      (target_type='prospect') via foreign key relation syntax,
//      ORDER BY COALESCE(combined_score, algo_score) DESC,
//      LIMIT (25 + contacted.size) — over-fetch to absorb exclusion
//   4. Filter contacted у JS, slice top 25
//   5. Discriminate target_type via XOR (client_id OR prospect_id)
//   6. Return { matches, total_fresh, total_contacted, empty, hint? }
//
// Empty state: якщо total_fresh=0 + matches expired → hint про
// /api/cron/matching-refresh.
//
// PRECONDITIONS:
//   - Migration 058 applied (product_match_runs table exists)
//   - Existing matches table populated by /api/cron/matching-refresh

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ─── Response shape ────────────────────────────────────────────

export interface UaFoundersSignalPublic {
  detected: boolean
  confidence: 'verified' | 'high' | 'medium' | 'low' | null
  source: 'crbr' | 'heuristic' | null
  names?: string[]
  signals?: string[]
}

export interface MatchRowPublic {
  id: string
  target_type: 'client' | 'prospect'
  target_id: string
  title: string
  city: string | null
  industry: string | null
  segment: string | null
  vat_status: string | null
  score: number
  ai_score: number | null
  sales_snippet: unknown
  ai_reasoning: string | null
  expires_at: string
  /** Phase 2 Krok 1.E S-CORE.3.B Phase A — cached UA-founder signal. */
  ua_founders_signal: UaFoundersSignalPublic | null
}

export interface TopMatchesResponse {
  matches: MatchRowPublic[]
  total_fresh: number
  total_contacted: number
  empty: boolean
  hint?: string
}

// ─── Handler ────────────────────────────────────────────────────

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleTopMatches(params)
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // GET also supported for browser/devtools convenience
  return handleTopMatches(params)
}

async function handleTopMatches(
  paramsPromise: Promise<{ id: string }>,
): Promise<NextResponse> {
  const { id } = await paramsPromise
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Nieautoryzowany' },
      { status: 401 },
    )
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json(
      { error: 'Niepoprawny product id (UUID expected)' },
      { status: 400 },
    )
  }

  // ── 1. Get contacted match_ids для exclusion ──
  const { data: contactedRows, error: contactedErr } = await supabase
    .from('product_match_runs')
    .select('match_id')
    .eq('product_id', id)
  if (contactedErr) {
    return NextResponse.json(
      { error: `DB error (product_match_runs): ${contactedErr.message}` },
      { status: 500 },
    )
  }
  const contactedSet = new Set(
    ((contactedRows ?? []) as Array<{ match_id: string }>).map(
      (r) => r.match_id,
    ),
  )

  // ── 2. Fetch matches (over-fetch to absorb contacted exclusion) ──
  const overFetch = 25 + contactedSet.size
  const nowIso = new Date().toISOString()

  const { data: matchRows, error: matchesErr } = await supabase
    .from('matches')
    .select(
      `
      id,
      client_id,
      prospect_id,
      algo_score,
      ai_score,
      combined_score,
      sales_snippet,
      ai_reasoning,
      expires_at,
      clients:client_id ( id, title, city, industry, vat_status, segment, ua_founders_signal ),
      ceidg_prospects:prospect_id ( id, name, miejscowosc, pkd_main, status, ua_founders_signal )
    `,
    )
    .eq('product_id', id)
    .gt('expires_at', nowIso)
    .order('combined_score', { ascending: false, nullsFirst: false })
    .order('algo_score', { ascending: false })
    .limit(overFetch)

  if (matchesErr) {
    return NextResponse.json(
      { error: `DB error (matches): ${matchesErr.message}` },
      { status: 500 },
    )
  }

  // ── 3. Filter contacted + map shape ──
  type RawMatchRow = {
    id: string
    client_id: string | null
    prospect_id: string | null
    algo_score: number
    ai_score: number | null
    combined_score: number | null
    sales_snippet: unknown
    ai_reasoning: string | null
    expires_at: string
    clients:
      | {
          id: string
          title: string
          city: string | null
          industry: string | null
          vat_status: string | null
          segment: string | null
          ua_founders_signal: UaFoundersSignalPublic | null
        }
      | Array<{
          id: string
          title: string
          city: string | null
          industry: string | null
          vat_status: string | null
          segment: string | null
          ua_founders_signal: UaFoundersSignalPublic | null
        }>
      | null
    ceidg_prospects:
      | {
          id: string
          name: string
          miejscowosc: string | null
          pkd_main: string | null
          status: string
          ua_founders_signal: UaFoundersSignalPublic | null
        }
      | Array<{
          id: string
          name: string
          miejscowosc: string | null
          pkd_main: string | null
          status: string
          ua_founders_signal: UaFoundersSignalPublic | null
        }>
      | null
  }

  const rows = (matchRows ?? []) as RawMatchRow[]
  const fresh: MatchRowPublic[] = []
  for (const row of rows) {
    if (contactedSet.has(row.id)) continue
    if (fresh.length >= 25) break

    const clientObj = Array.isArray(row.clients) ? row.clients[0] : row.clients
    const prospectObj = Array.isArray(row.ceidg_prospects)
      ? row.ceidg_prospects[0]
      : row.ceidg_prospects

    const score = row.combined_score ?? row.algo_score
    const ai_score = row.ai_score
    const sales_snippet = row.sales_snippet
    const ai_reasoning = row.ai_reasoning
    const expires_at = row.expires_at

    if (clientObj && row.client_id) {
      fresh.push({
        id: row.id,
        target_type: 'client',
        target_id: row.client_id,
        title: clientObj.title,
        city: clientObj.city,
        industry: clientObj.industry,
        segment: clientObj.segment,
        vat_status: clientObj.vat_status,
        score,
        ai_score,
        sales_snippet,
        ai_reasoning,
        expires_at,
        ua_founders_signal: clientObj.ua_founders_signal ?? null,
      })
    } else if (prospectObj && row.prospect_id) {
      fresh.push({
        id: row.id,
        target_type: 'prospect',
        target_id: row.prospect_id,
        title: prospectObj.name,
        city: prospectObj.miejscowosc,
        industry: prospectObj.pkd_main,
        segment: prospectObj.status,
        vat_status: null,
        score,
        ai_score,
        sales_snippet,
        ai_reasoning,
        expires_at,
        ua_founders_signal: prospectObj.ua_founders_signal ?? null,
      })
    }
    // Якщо ні clientObj ні prospectObj — XOR violation (shouldn't happen per
    // 026 schema CHECK constraint). Skip silently.
  }

  // ── 4. Empty state hint ──
  const empty = fresh.length === 0
  let hint: string | undefined
  if (empty) {
    if (rows.length === 0) {
      hint =
        'Brak fresh dopasowań у matches table. Уruchom matching refresh: ' +
        'POST /api/cron/matching-refresh або через admin panel.'
    } else if (contactedSet.size > 0) {
      hint = `Wszystkie ${contactedSet.size} dopasowań уже oznaczono jako "Zkontaktowano". Refresh matches або wyczyść product_match_runs.`
    } else {
      hint = 'Wszystkie dopasowania wygasły (expires_at < now). Uruchom matching refresh.'
    }
  }

  const response: TopMatchesResponse = {
    matches: fresh,
    total_fresh: fresh.length,
    total_contacted: contactedSet.size,
    empty,
    hint,
  }

  return NextResponse.json(response)
}
