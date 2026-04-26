'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import {
  computePrice,
  settingsRowsToPricing,
  type PricingSettings,
} from '@/lib/pricing'

const dealStageEnum = z.enum([
  'lead',
  'oferta',
  'negocjacje',
  'sample',
  'kontrakt',
  'wygrana',
  'przegrana',
])

const dealItemSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  product_name_snapshot: z.string().nullable().optional(),
  product_gramatura_snapshot: z.string().nullable().optional(),
  product_ean_snapshot: z.string().nullable().optional(),
  quantity: z.number().positive('Ilość musi być > 0'),
  unit: z.string().nullable().optional(),
  unit_price_buy: z.number().min(0).nullable().optional(),
  unit_price_sell: z.number().min(0),
  unit_price_override: z.boolean().optional(),
  vat_rate: z.number().min(0).max(1).optional(),
  notes: z.string().nullable().optional(),
  position: z.number().int().min(0).optional(),
})

export type DealItemInput = z.infer<typeof dealItemSchema>

export type DealActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

const dealSchema = z.object({
  title: z.string().min(2, 'Tytuł wymagany').optional(),
  client_id: z.string().uuid().nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  person_id: z.string().uuid().nullable().optional(),
  stage: dealStageEnum,
  probability: z.number().int().min(0).max(100).optional(),
  currency: z.string().min(3).max(3).optional(),
  deal_type: z.enum(['reseller', 'agent', 'partner']).nullable().optional(),
  commission_pct: z.number().min(0).max(100).nullable().optional(),
  delivery_terms: z.string().nullable().optional(),
  expected_close_date: z.string().nullable().optional(),
  next_action_date: z.string().nullable().optional(),
  next_action_note: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export type DealCreateInput = z.infer<typeof dealSchema>
export type DealUpdateInput = Partial<DealCreateInput>

async function readPricing(): Promise<PricingSettings> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('settings')
    .select('key, value')
  return settingsRowsToPricing(data)
}

// Compute line margin from cost + sell + line total. Server-only — keeps
// margin numbers off the wire toward the client bundle.
function computeLineMargin(
  cost_pln: number | null,
  unit_price_sell: number,
  quantity: number,
): { line_margin_pln: number; line_margin_pct: number } | null {
  if (cost_pln == null || cost_pln <= 0) return null
  const line_total = unit_price_sell * quantity
  if (line_total <= 0) return null
  const line_margin_pln = +(line_total - cost_pln * quantity).toFixed(2)
  const line_margin_pct = +(((line_total - cost_pln * quantity) / line_total) * 100).toFixed(2)
  return { line_margin_pln, line_margin_pct }
}

export async function createDeal(
  input: DealCreateInput,
): Promise<DealActionResult> {
  const parsed = dealSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const payload = {
    ...parsed.data,
    title: parsed.data.title ?? 'Nowa szansa',
    currency: parsed.data.currency ?? 'PLN',
    probability: parsed.data.probability ?? 30,
    owner_id: user.id,
  }

  const { data: created, error } = await supabase
    .from('deals')
    .insert(payload)
    .select('id')
    .single()

  if (error || !created) {
    return { ok: false, error: error?.message ?? 'Błąd zapisu' }
  }

  revalidatePath('/deals')
  return { ok: true, id: created.id }
}

export async function updateDeal(
  id: string,
  input: DealUpdateInput,
): Promise<DealActionResult> {
  const parsed = dealSchema.partial().safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const { error } = await supabase
    .from('deals')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/deals')
  revalidatePath(`/deals/${id}`)
  return { ok: true, id }
}

export async function deleteDeal(id: string): Promise<DealActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const { error } = await supabase
    .from('deals')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/deals')
  return { ok: true, id }
}

// Fetches a deal's line items for the editor.
export async function listDealItems(dealId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('deal_items')
    .select('*')
    .eq('deal_id', dealId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function createDealItem(
  dealId: string,
  input: DealItemInput,
): Promise<DealActionResult> {
  const parsed = dealItemSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  // Verify deal ownership before any insert (RLS double-check).
  const { data: deal } = await supabase
    .from('deals')
    .select('id, owner_id')
    .eq('id', dealId)
    .single()
  if (!deal || deal.owner_id !== user.id) {
    return { ok: false, error: 'Brak dostępu do tej szansy' }
  }

  const margin = computeLineMargin(
    parsed.data.unit_price_buy ?? null,
    parsed.data.unit_price_sell,
    parsed.data.quantity,
  )

  const payload = {
    deal_id: dealId,
    product_id: parsed.data.product_id ?? null,
    product_name_snapshot: parsed.data.product_name_snapshot ?? null,
    product_gramatura_snapshot: parsed.data.product_gramatura_snapshot ?? null,
    product_ean_snapshot: parsed.data.product_ean_snapshot ?? null,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit ?? 'szt',
    unit_price_buy: parsed.data.unit_price_buy ?? null,
    unit_price_sell: parsed.data.unit_price_sell,
    unit_price_override: parsed.data.unit_price_override ?? false,
    line_margin_pln: margin?.line_margin_pln ?? null,
    line_margin_pct: margin?.line_margin_pct ?? null,
    vat_rate: parsed.data.vat_rate ?? 0.05,
    notes: parsed.data.notes ?? null,
    position: parsed.data.position ?? 0,
  }

  const { data: created, error } = await supabase
    .from('deal_items')
    .insert(payload)
    .select('id')
    .single()

  if (error || !created) {
    return { ok: false, error: error?.message ?? 'Błąd zapisu pozycji' }
  }

  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/deals/${dealId}/edit`)
  return { ok: true, id: created.id }
}

export async function updateDealItem(
  id: string,
  input: Partial<DealItemInput>,
): Promise<DealActionResult> {
  const parsed = dealItemSchema.partial().safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  // Recompute margin if cost/sell/quantity present
  let margin: { line_margin_pln: number; line_margin_pct: number } | null = null
  if (
    parsed.data.unit_price_sell != null &&
    parsed.data.quantity != null &&
    parsed.data.unit_price_buy != null
  ) {
    margin = computeLineMargin(
      parsed.data.unit_price_buy,
      parsed.data.unit_price_sell,
      parsed.data.quantity,
    )
  }

  const updates: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  }
  if (margin) {
    updates.line_margin_pln = margin.line_margin_pln
    updates.line_margin_pct = margin.line_margin_pct
  }

  const { data: row, error } = await supabase
    .from('deal_items')
    .update(updates)
    .eq('id', id)
    .select('id, deal_id')
    .single()

  if (error || !row) return { ok: false, error: error?.message ?? 'Błąd' }

  revalidatePath(`/deals/${row.deal_id}`)
  revalidatePath(`/deals/${row.deal_id}/edit`)
  return { ok: true, id: row.id as string }
}

export async function deleteDealItem(
  id: string,
): Promise<DealActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const { data: row } = await supabase
    .from('deal_items')
    .select('deal_id')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('deal_items').delete().eq('id', id)

  if (error) return { ok: false, error: error.message }
  if (row?.deal_id) {
    revalidatePath(`/deals/${row.deal_id}`)
    revalidatePath(`/deals/${row.deal_id}/edit`)
  }
  return { ok: true, id }
}

// Suggests unit_price_sell from product.cost_pln + tier margin. Used
// when adding an item; user can still override.
export async function suggestPriceForProduct(
  productId: string,
  clientId: string | null,
  currentDealTotal: number,
): Promise<{
  cost_pln: number | null
  unit_price_sell: number
  tier: 'maly_opt' | 'sredni_opt' | 'duzy_opt' | 'strategic_katalog'
  margin: number
} | null> {
  const supabase = await createClient()
  const [{ data: product }, { data: clientRow }, pricing] = await Promise.all([
    supabase
      .from('products')
      .select('cost_pln, vat_rate')
      .eq('id', productId)
      .single(),
    clientId
      ? supabase
          .from('clients')
          .select('client_type, contracted_margin_katalog_pct')
          .eq('id', clientId)
          .single()
      : Promise.resolve({ data: null }),
    readPricing(),
  ])

  if (!product || product.cost_pln == null) return null

  // Strategic partner: use contracted_margin_katalog_pct as starting price.
  if (
    clientRow &&
    (clientRow as { client_type?: string }).client_type === 'strategic_partner'
  ) {
    const margin =
      (clientRow as { contracted_margin_katalog_pct?: number })
        .contracted_margin_katalog_pct ?? pricing.margin_strategic_katalog
    return {
      cost_pln: product.cost_pln,
      unit_price_sell: computePrice(product.cost_pln, margin),
      tier: 'strategic_katalog',
      margin,
    }
  }

  // Standard: pick tier based on current deal total.
  let margin = pricing.margin_maly_opt
  let tier: 'maly_opt' | 'sredni_opt' | 'duzy_opt' = 'maly_opt'
  if (currentDealTotal >= pricing.threshold_duzy_pln) {
    margin = pricing.margin_duzy_opt
    tier = 'duzy_opt'
  } else if (currentDealTotal >= pricing.threshold_sredni_pln) {
    margin = pricing.margin_sredni_opt
    tier = 'sredni_opt'
  }

  return {
    cost_pln: product.cost_pln,
    unit_price_sell: computePrice(product.cost_pln, margin),
    tier,
    margin,
  }
}
