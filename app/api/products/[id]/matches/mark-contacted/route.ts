// app/api/products/[id]/matches/mark-contacted/route.ts
// Sprint S-CORE.3.B (B piece) — manual mark-contacted endpoint.
//
// Flow:
//   1. Auth + UUID validate (product_id + match_id)
//   2. INSERT INTO product_match_runs з ON CONFLICT (product_id, match_id)
//      DO NOTHING (idempotent — повторний клік не пробує double-insert).
//   3. Return { ok: true } or error envelope.
//
// PRECONDITIONS:
//   - Migration 058 applied (product_match_runs table exists)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

const UUID_RE = /^[0-9a-f-]{36}$/i

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: productId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Nieautoryzowany' },
      { status: 401 },
    )
  }
  if (!UUID_RE.test(productId)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny product id' },
      { status: 400 },
    )
  }

  let body: { match_id?: string }
  try {
    body = (await req.json()) as { match_id?: string }
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 },
    )
  }
  const matchId = body.match_id
  if (!matchId || !UUID_RE.test(matchId)) {
    return NextResponse.json(
      { ok: false, error: 'match_id (UUID) required у body' },
      { status: 400 },
    )
  }

  // INSERT з ON CONFLICT DO NOTHING (per UNIQUE constraint у migration 058).
  // Supabase JS upsert з ignoreDuplicates=true emulates це.
  const { error: insertErr } = await supabase
    .from('product_match_runs')
    .upsert(
      {
        product_id: productId,
        match_id: matchId,
        contacted_by: user.id,
      },
      {
        onConflict: 'product_id,match_id',
        ignoreDuplicates: true,
      },
    )

  if (insertErr) {
    // Якщо migration 058 не applied — error message буде про відсутню table.
    // Передаємо clearly для UI debug.
    const msg = insertErr.message
    if (/relation.*product_match_runs.*does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Migration 058 не applied. Run: pnpm dlx tsx scripts/apply-migration.ts scripts/058_product_match_runs.sql',
        },
        { status: 500 },
      )
    }
    return NextResponse.json(
      { ok: false, error: `INSERT failed: ${msg}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
