'use server'

// app/actions/pricing-admin.ts
// Faza 1 DAGOLD (089) — server actions dla panelu cen:
//   - updateProductMarza     (KROK C — bulk marża produktów)
//   - upsertPriceSegment     (KROK D — segmenty A/B/C)
//   - updateClientPricing    (KROK E — segment + indywidualna zniżka klienta)
// Wartości % przechowywane jako UŁAMEK (0.10 = 10%), spójnie z lib/pricing.ts.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

type ActionResult = { ok: true } | { ok: false; error: string }

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null }
  return { supabase, user }
}

// ── KROK C — marża bazowa per produkt ──────────────────────────────────────
const MarzaSchema = z.object({
  productId: z.string().uuid(),
  // ułamek 0..0.95 albo null (czyści → fallback na globalną marżę)
  marzaPct: z.number().min(0).max(0.95).nullable(),
})

export async function updateProductMarza(
  productId: string,
  marzaPct: number | null,
): Promise<ActionResult> {
  const parsed = MarzaSchema.safeParse({ productId, marzaPct })
  if (!parsed.success) return { ok: false, error: 'Niepoprawna marża (0–95%)' }
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const { error } = await supabase
    .from('products')
    .update({ marza_bazowa_pct: parsed.data.marzaPct })
    .eq('id', parsed.data.productId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/produkty/marze')
  revalidatePath('/produkty')
  return { ok: true }
}

// ── KROK D — segmenty cenowe ───────────────────────────────────────────────
const SegmentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Kod wymagany')
    .max(16)
    .regex(/^[A-Za-z0-9_-]+$/, 'Kod: litery/cyfry/-/_'),
  name: z.string().trim().min(1, 'Nazwa wymagana').max(120),
  znizka_pct: z.number().min(0).max(0.95),
  sort_order: z.number().int().min(0).max(9999),
})

export async function upsertPriceSegment(input: {
  code: string
  name: string
  znizka_pct: number
  sort_order: number
}): Promise<ActionResult> {
  const parsed = SegmentSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Niepoprawne dane segmentu',
    }
  }
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const { error } = await supabase
    .from('price_segments')
    .upsert(
      {
        code: parsed.data.code.toUpperCase(),
        name: parsed.data.name,
        znizka_pct: parsed.data.znizka_pct,
        sort_order: parsed.data.sort_order,
      },
      { onConflict: 'code' },
    )
  if (error) return { ok: false, error: error.message }
  revalidatePath('/ceny/segmenty')
  return { ok: true }
}

// ── KROK E — segment + indywidualna zniżka klienta ─────────────────────────
const ClientPricingSchema = z.object({
  clientId: z.string().uuid(),
  price_segment_code: z.string().trim().max(16).nullable(),
  // ułamek 0..0.95 albo null (brak zniżki indywidualnej → segment)
  znizka_indywidualna_pct: z.number().min(0).max(0.95).nullable(),
})

export async function updateClientPricing(input: {
  clientId: string
  price_segment_code: string | null
  znizka_indywidualna_pct: number | null
}): Promise<ActionResult> {
  const parsed = ClientPricingSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Niepoprawne dane',
    }
  }
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const { error } = await supabase
    .from('clients')
    .update({
      price_segment_code: parsed.data.price_segment_code || null,
      znizka_indywidualna_pct: parsed.data.znizka_indywidualna_pct,
    })
    .eq('id', parsed.data.clientId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/clients/${parsed.data.clientId}`)
  return { ok: true }
}

// ── price-admin nav — masowe przypisanie segmentu klientom ─────────────────
// code=null → wyczyść (NULL = domyślnie segment A / cena standardowa).
const BulkSegmentSchema = z.object({
  code: z.string().trim().min(1).max(16).nullable(),
  clientIds: z.array(z.string().uuid()).min(1).max(1000),
})

export async function assignSegmentToClients(
  code: string | null,
  clientIds: string[],
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const parsed = BulkSegmentSchema.safeParse({ code, clientIds })
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Niepoprawne dane',
    }
  }
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }

  const ids = Array.from(new Set(parsed.data.clientIds))
  const normalized = parsed.data.code ? parsed.data.code.toUpperCase() : null

  // Jeśli code podany — musi istnieć w price_segments (FK i tak by złapał,
  // ale czytelny błąd lepszy niż 23503).
  if (normalized) {
    const { data: seg, error: segErr } = await supabase
      .from('price_segments')
      .select('code')
      .eq('code', normalized)
      .maybeSingle()
    if (segErr) return { ok: false, error: segErr.message }
    if (!seg) return { ok: false, error: `Segment "${normalized}" nie istnieje` }
  }

  const { error, count } = await supabase
    .from('clients')
    .update({ price_segment_code: normalized }, { count: 'exact' })
    .in('id', ids)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/ceny/klienci')
  return { ok: true, updated: count ?? 0 }
}
