// app/api/orders/[token]/templates/route.ts
// Sprint T-ORDER.4a-SHELL (30.05.2026) — szablony zamówień klienta.
//
// GET  /api/orders/[token]/templates   → lista szablonów tego client_id
// POST /api/orders/[token]/templates   → zapisz nowy szablon { nazwa, pozycje }
//
// Walidacja przez access_token bieżącego order — publiczny endpoint klienta.
// order_templates RLS (mig 078): auth.uid()=owner_id. Tu używamy admin client
// (service-role bypass) bo klient na publicznym formularzu nie jest zalogowany.
// owner_id ustawiany z owner_id bieżącego clients row (Vadym).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

const PozycjaSchema = z.object({
  product_id: z.string().regex(UUID_RE, 'Niepoprawne ID produktu'),
  qty: z.number().int().min(1).max(9999),
})

const PostSchema = z.object({
  nazwa: z.string().trim().min(2, 'Nazwa wymagana (min. 2 znaki)').max(100),
  pozycje: z.array(PozycjaSchema).min(1, 'Wybierz przynajmniej jeden produkt'),
})

type RouteContext = { params: Promise<{ token: string }> }

// ─── helper: resolve client_id + owner_id z access_token ──────────────
async function resolveOrderContext(token: string) {
  const admin = createAdminClient()
  const { data: order, error } = await admin
    .from('orders')
    .select('client_id, client:clients!inner(owner_id)')
    .eq('access_token', token)
    .maybeSingle()
  if (error) {
    return { admin, error: { code: 500, message: 'Błąd bazy danych' } }
  }
  if (!order) {
    return { admin, error: { code: 404, message: 'Zamówienie nie znalezione' } }
  }
  const clientId = (order as any).client_id as string
  const ownerId = (order as any).client?.owner_id as string | undefined
  if (!ownerId) {
    return { admin, error: { code: 500, message: 'Brak owner_id klienta' } }
  }
  return { admin, clientId, ownerId }
}

// ─── GET: lista szablonów ────────────────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { token } = await ctx.params
  if (!UUID_RE.test(token)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny token' },
      { status: 400 },
    )
  }

  const resolved = await resolveOrderContext(token)
  if (resolved.error) {
    return NextResponse.json(
      { ok: false, error: resolved.error.message },
      { status: resolved.error.code },
    )
  }
  const { admin, clientId } = resolved

  const { data: templates, error } = await admin
    .from('order_templates')
    .select('id, nazwa, pozycje, utworzyl, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[orders][token][templates][GET] failed:', error.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd ładowania szablonów' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    templates: templates ?? [],
  })
}

// ─── POST: zapisz nowy szablon ──────────────────────────────────────
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { token } = await ctx.params
  if (!UUID_RE.test(token)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny token' },
      { status: 400 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny format danych' },
      { status: 400 },
    )
  }

  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Niepoprawne dane',
      },
      { status: 422 },
    )
  }

  const resolved = await resolveOrderContext(token)
  if (resolved.error) {
    return NextResponse.json(
      { ok: false, error: resolved.error.message },
      { status: resolved.error.code },
    )
  }
  const { admin, clientId, ownerId } = resolved

  const { data: inserted, error: insertErr } = await admin
    .from('order_templates')
    .insert({
      client_id: clientId,
      owner_id: ownerId,
      nazwa: parsed.data.nazwa,
      utworzyl: 'klient',
      pozycje: parsed.data.pozycje,
    })
    .select('id, nazwa, pozycje, utworzyl, created_at')
    .single()

  if (insertErr) {
    console.error('[orders][token][templates][POST] failed:', insertErr.message)
    return NextResponse.json(
      { ok: false, error: 'Nie udało się zapisać szablonu' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, template: inserted })
}
