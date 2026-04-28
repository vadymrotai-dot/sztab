// app/api/admin/matching/ai-rescore/route.ts
// POST ?product_id=<uuid> — rescore TOP-20 matches dla одного product.
// Sync execution. Returns summary + cost.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rescoreTop20 } from '@/lib/matching/ai-rescore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  const id = new URL(req.url).searchParams.get('product_id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Wymagany product_id (UUID)' }, { status: 400 })
  }

  const { data: paramsRow } = await supabase
    .from('params')
    .select('anthropic_api_key')
    .limit(1)
    .maybeSingle()
  const apiKey = (paramsRow as { anthropic_api_key?: string } | null)?.anthropic_api_key ?? null
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'params.anthropic_api_key not set — patrz /settings → Klucze API' },
      { status: 500 },
    )
  }

  const summary = await rescoreTop20(supabase, apiKey, id)
  return NextResponse.json({ ok: !summary.error, summary })
}
