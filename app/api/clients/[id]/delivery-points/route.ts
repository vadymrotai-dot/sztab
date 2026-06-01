// app/api/clients/[id]/delivery-points/route.ts
// Przejście 1A (T-ORDER.5) — CRUD zapisanych punktów dostawy klienta.
//
// GET    /api/clients/[id]/delivery-points              → lista is_active punktów
// DELETE /api/clients/[id]/delivery-points?point_id=... → soft-delete (is_active=false)
//
// Auth: cookies session (auth.getUser) — admin panel Vadyma (wzór send-offer).
// Dane przez admin client (service-role) + ręczna weryfikacja owner_id z clients
// (client_delivery_points RLS = auth.uid()=owner_id, 078 §H).
//
// Protocol: NIE kasujemy trwale — DELETE robi soft-delete (is_active=false),
// żeby historyczne order_delivery_points.client_delivery_point_id nie traciły
// linku (FK SET NULL by je wyzerował przy hard delete).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

// Przejście 1B — ręczne dodanie punktu do profilu (panel Vadyma).
const PostSchema = z.object({
  nazwa: z.string().trim().min(2, 'Nazwa wymagana (min. 2 znaki)').max(150),
  ulica: z.string().trim().min(2, 'Ulica wymagana (min. 2 znaki)').max(200),
  miasto: z.string().trim().min(2, 'Miasto wymagane (min. 2 znaki)').max(100),
  kod_pocztowy: z.string().trim().max(10).optional().nullable(),
  typ_punktu: z.enum(['sklep', 'magazyn']).optional().default('sklep'),
  odbiorca_imie: z.string().trim().max(150).optional().nullable(),
  odbiorca_telefon: z.string().trim().max(20).optional().nullable(),
})

type RouteContext = { params: Promise<{ id: string }> }

// ─── helper: auth gate + resolve client (owner check) ───────────────
async function resolveClientContext(clientId: string) {
  if (!UUID_RE.test(clientId)) {
    return { error: { code: 400, message: 'Niepoprawne ID klienta' } }
  }

  // Auth gate — cookies session (Vadym zalogowany w panelu).
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: { code: 401, message: 'Nieautoryzowany' } }
  }

  const admin = createAdminClient()
  const { data: client, error } = await admin
    .from('clients')
    .select('id, owner_id')
    .eq('id', clientId)
    .maybeSingle()
  if (error) {
    console.error('[clients][delivery-points] client load failed:', error.message)
    return { error: { code: 500, message: 'Błąd bazy danych' } }
  }
  if (!client) {
    return { error: { code: 404, message: 'Klient nie znaleziony' } }
  }
  // Owner check — punkty są owner-scoped (client_delivery_points RLS).
  if (client.owner_id !== user.id) {
    return { error: { code: 403, message: 'Brak dostępu do tego klienta' } }
  }

  return { admin, clientId, ownerId: client.owner_id as string }
}

// ─── GET: lista is_active punktów ───────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const resolved = await resolveClientContext(id)
  if (resolved.error) {
    return NextResponse.json(
      { ok: false, error: resolved.error.message },
      { status: resolved.error.code },
    )
  }
  const { admin, clientId } = resolved

  const { data: points, error } = await admin
    .from('client_delivery_points')
    .select(
      'id, nazwa, ulica, kod_pocztowy, miasto, typ_punktu, odbiorca_imie, odbiorca_telefon',
    )
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[clients][delivery-points][GET] failed:', error.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd ładowania punktów dostawy' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, points: points ?? [] })
}

// ─── POST: ręczne dodanie punktu do profilu ─────────────────────────
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const resolved = await resolveClientContext(id)
  if (resolved.error) {
    return NextResponse.json(
      { ok: false, error: resolved.error.message },
      { status: resolved.error.code },
    )
  }
  const { admin, clientId, ownerId } = resolved

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
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Niepoprawne dane' },
      { status: 422 },
    )
  }

  const { data: inserted, error: insertErr } = await admin
    .from('client_delivery_points')
    .insert({
      client_id: clientId,
      owner_id: ownerId,
      nazwa: parsed.data.nazwa,
      ulica: parsed.data.ulica,
      miasto: parsed.data.miasto,
      kod_pocztowy: parsed.data.kod_pocztowy || null,
      typ_punktu: parsed.data.typ_punktu,
      odbiorca_imie: parsed.data.odbiorca_imie || null,
      odbiorca_telefon: parsed.data.odbiorca_telefon || null,
    })
    .select(
      'id, nazwa, ulica, kod_pocztowy, miasto, typ_punktu, odbiorca_imie, odbiorca_telefon',
    )
    .single()

  if (insertErr || !inserted) {
    console.error('[clients][delivery-points][POST] failed:', insertErr?.message)
    return NextResponse.json(
      { ok: false, error: 'Nie udało się zapisać punktu' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, point: inserted })
}

// ─── DELETE: soft-delete (is_active=false) ──────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const resolved = await resolveClientContext(id)
  if (resolved.error) {
    return NextResponse.json(
      { ok: false, error: resolved.error.message },
      { status: resolved.error.code },
    )
  }
  const { admin, clientId } = resolved

  const pointId = req.nextUrl.searchParams.get('point_id')
  const parsed = z.string().regex(UUID_RE, 'Niepoprawne ID punktu').safeParse(pointId)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Parametr point_id wymagany (UUID)' },
      { status: 400 },
    )
  }

  // Soft-delete — tylko własny punkt tego klienta.
  const { data: updated, error } = await admin
    .from('client_delivery_points')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', parsed.data)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[clients][delivery-points][DELETE] failed:', error.message)
    return NextResponse.json(
      { ok: false, error: 'Błąd usuwania punktu' },
      { status: 500 },
    )
  }
  if (!updated) {
    return NextResponse.json(
      { ok: false, error: 'Punkt nie znaleziony lub już usunięty' },
      { status: 404 },
    )
  }

  return NextResponse.json({ ok: true, deleted_id: updated.id })
}
