// app/api/orders/admin/[id]/route.ts
// Sprint S-ORDER.1.C.2 (19.05.2026) — admin PATCH endpoint для status + internal_notes.
//
// PATCH /api/orders/admin/[id]
//   - Auth required (cookies-based session)
//   - Body: { status?: OrderStatus, internal_notes?: string|null }
//   - Auto-sets confirmed_at коли status → 'confirmed'
//   - Always bumps updated_at
//   - Service-role bypass для UPDATE (admin operation)

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

const VALID_STATUSES = [
  'draft',
  'submitted',
  'confirmed',
  'in_realization',
  'shipped',
  'invoiced',
  'cancelled',
] as const

const PatchSchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  internal_notes: z.string().max(2000).optional().nullable(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawne ID' },
      { status: 400 },
    )
  }

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

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Błędy walidacji',
        details: parsed.error.flatten(),
      },
      { status: 422 },
    )
  }

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }
  if (parsed.data.status) {
    updates.status = parsed.data.status
    if (parsed.data.status === 'confirmed') {
      updates.confirmed_at = new Date().toISOString()
    }
  }
  if (parsed.data.internal_notes !== undefined) {
    updates.internal_notes = parsed.data.internal_notes
  }

  const admin = createAdminClient()
  const { error } = await admin.from('orders').update(updates).eq('id', id)

  if (error) {
    console.error('[orders][admin][PATCH] update failed:', error.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd zapisu' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, updated: updates })
}
