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
  // Przejście 1A — opcjonalny indeks do delivery_points (multipoint snapshot).
  delivery_point_index: z.number().int().min(0).optional(),
})

// Przejście 1A — snapshot punktu dostawy (kształt jak DeliveryPointSchema w submit).
const DeliveryPointSnapSchema = z.object({
  label: z.string().max(100).optional().nullable(),
  ulica: z.string().max(200).optional().nullable(),
  kod_pocztowy: z.string().max(10).optional().nullable(),
  miasto: z.string().max(100).optional().nullable(),
  typ: z.enum(['dostawa', 'odbior']).optional().default('dostawa'),
  termin_typ: z.enum(['najblizszy', 'data']).optional().default('najblizszy'),
  preferred_date: z.string().optional().nullable(),
  odbiorca_imie: z.string().max(150).optional().nullable(),
  odbiorca_telefon: z.string().max(20).optional().nullable(),
})

const PostSchema = z.object({
  nazwa: z.string().trim().min(2, 'Nazwa wymagana (min. 2 znaki)').max(100),
  pozycje: z.array(PozycjaSchema).min(1, 'Wybierz przynajmniej jeden produkt'),
  // Przejście 1A — pełny snapshot dostawy (opcjonalny, back-compat dla 078).
  delivery_mode: z.enum(['jeden', 'kilka']).optional().default('jeden'),
  documents_mode: z.enum(['wspolna', 'osobne']).optional().default('wspolna'),
  delivery_points: z.array(DeliveryPointSnapSchema).optional().default([]),
  wspolna_data: z.boolean().optional().default(false),
  wspolny_termin_typ: z.enum(['najblizszy', 'data']).optional().nullable(),
  wspolny_preferred_date: z.string().optional().nullable(),
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
    // Przejście 1A — zwróć też snapshot dostawy (delivery_mode/points/wspólny termin).
    .select(
      'id, nazwa, pozycje, utworzyl, created_at, delivery_mode, documents_mode, delivery_points, wspolna_data, wspolny_termin_typ, wspolny_preferred_date',
    )
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

  // Przejście 1A — light cross-walidacja snapshotu (mirror submit, ale szablon
  // może być częściowy). 'kilka' wymaga >=2 punktów; 'osobne' tylko przy 'kilka'.
  if (parsed.data.delivery_mode === 'kilka' && parsed.data.delivery_points.length < 2) {
    return NextResponse.json(
      { ok: false, error: 'Tryb "kilka punktów" wymaga przynajmniej 2 punktów dostawy' },
      { status: 422 },
    )
  }
  if (parsed.data.documents_mode === 'osobne' && parsed.data.delivery_mode !== 'kilka') {
    return NextResponse.json(
      { ok: false, error: 'Tryb dokumentów "osobne" dostępny tylko przy kilku punktach' },
      { status: 422 },
    )
  }

  const { data: inserted, error: insertErr } = await admin
    .from('order_templates')
    .insert({
      client_id: clientId,
      owner_id: ownerId,
      nazwa: parsed.data.nazwa,
      utworzyl: 'klient',
      pozycje: parsed.data.pozycje,
      // Przejście 1A — pełny snapshot dostawy.
      delivery_mode: parsed.data.delivery_mode,
      documents_mode: parsed.data.documents_mode,
      delivery_points: parsed.data.delivery_points,
      wspolna_data: parsed.data.wspolna_data,
      wspolny_termin_typ: parsed.data.wspolny_termin_typ ?? null,
      wspolny_preferred_date: parsed.data.wspolny_preferred_date || null,
    })
    .select(
      'id, nazwa, pozycje, utworzyl, created_at, delivery_mode, documents_mode, delivery_points, wspolna_data, wspolny_termin_typ, wspolny_preferred_date',
    )
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
