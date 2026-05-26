// app/api/orders/admin/create/route.ts
// Sprint S-ORDER.1.D (19.05.2026) — generate draft order link для клієнта.
//
// POST /api/orders/admin/create
//   Body: { client_id: uuid, cohort_id?: uuid|null }
//   - Auth required (cookies session)
//   - Verify client existуй
//   - Якщо existуй active draft (status='draft') → return existing URL (idempotent)
//   - Інакше — створи new draft з access_token (DB default gen_random_uuid)
//   - Return { ok, order_id, access_token, is_existing }
//
// Service-role bypass для INSERT (admin operation).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

const CreateSchema = z.object({
  client_id: z.string().regex(UUID_RE),
  cohort_id: z.string().regex(UUID_RE).optional().nullable(),
})

export async function POST(req: NextRequest) {
  // Auth gate
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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny format' },
      { status: 400 },
    )
  }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Walidacja',
        details: parsed.error.flatten(),
      },
      { status: 422 },
    )
  }

  const admin = createAdminClient()

  // Verify client existуй
  const { data: client } = await admin
    .from('clients')
    .select('id, title')
    .eq('id', parsed.data.client_id)
    .maybeSingle()
  if (!client) {
    return NextResponse.json(
      { ok: false, error: 'Klient nie znaleziony' },
      { status: 404 },
    )
  }

  // Check existing active draft (idempotent)
  const { data: existing } = await admin
    .from('orders')
    .select('id, access_token')
    .eq('client_id', parsed.data.client_id)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({
      ok: true,
      order_id: existing.id,
      access_token: existing.access_token,
      is_existing: true,
    })
  }

  // Create new draft
  const { data: created, error } = await admin
    .from('orders')
    .insert({
      client_id: parsed.data.client_id,
      cohort_id: parsed.data.cohort_id || null,
      order_number: `DRAFT-${Date.now()}-${parsed.data.client_id.slice(0, 8)}`,
      status: 'draft',
    })
    .select('id, access_token')
    .single()
  if (error || !created) {
    console.error('[orders][admin][create] insert failed:', error?.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd tworzenia zamówienia' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    order_id: created.id,
    access_token: created.access_token,
    is_existing: false,
  })
}
