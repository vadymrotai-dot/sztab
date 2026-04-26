'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import {
  computeCostPln,
  computePriceTiers,
  settingsRowsToPricing,
} from '@/lib/pricing'

const baseSchema = z.object({
  lp: z.number().int().nullable().optional(),
  name: z.string().min(2, 'Nazwa wymagana (min 2 znaki)'),
  gramatura: z.string().nullable().optional(),
  ean: z.string().nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  category: z.string().nullable().optional(),
  cost_eur: z.number().min(0).nullable().optional(),
  cost_pln: z.number().min(0).nullable().optional(),
  price_maly_opt: z.number().min(0).nullable().optional(),
  price_sredni: z.number().min(0).nullable().optional(),
  price_duzy: z.number().min(0).nullable().optional(),
  price_duzi_gracze: z.number().min(0).nullable().optional(),
  price_min: z.number().min(0).nullable().optional(),
  vat_rate: z.number().min(0).max(1).nullable().optional(),
  push_tier: z.number().int().min(1).max(3).nullable().optional(),
  is_hero: z.boolean().nullable().optional(),
  seasonality_status: z
    .enum(['available', 'low_stock', 'out_of_stock', 'seasonal'])
    .nullable()
    .optional(),
  tags: z.array(z.string()).nullable().optional(),
  shelf_life_days: z.number().int().min(0).nullable().optional(),
  unit: z.string().nullable().optional(),
  vertical: z.string().nullable().optional(),
})

export type ProductCreateInput = z.infer<typeof baseSchema>
export type ProductUpdateInput = Partial<ProductCreateInput>

export type ProductActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

async function readPricing() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', [
      'kurs_eur_pln',
      'overhead_multiplier',
      'margin_maly_opt',
      'margin_sredni_opt',
      'margin_duzy_opt',
      'margin_strategic_katalog',
      'margin_strategic_docel',
      'threshold_sredni_pln',
      'threshold_duzy_pln',
    ])
  return settingsRowsToPricing(data)
}

// Fills cost_pln + 5 price tiers from settings if the caller didn't
// override them. User-supplied prices always win — that's the point of
// the price-tier inputs in the form.
async function applyPricing<
  T extends Pick<
    ProductCreateInput,
    | 'cost_eur'
    | 'cost_pln'
    | 'price_maly_opt'
    | 'price_sredni'
    | 'price_duzy'
    | 'price_duzi_gracze'
    | 'price_min'
  >,
>(input: T): Promise<T> {
  const pricing = await readPricing()
  const cost_eur = input.cost_eur ?? 0
  const cost_pln =
    input.cost_pln ??
    computeCostPln(cost_eur, pricing.kurs_eur_pln, pricing.overhead_multiplier)
  const tiers = computePriceTiers(cost_pln, pricing)

  return {
    ...input,
    cost_pln,
    price_maly_opt: input.price_maly_opt ?? tiers.price_maly_opt,
    price_sredni: input.price_sredni ?? tiers.price_sredni,
    price_duzy: input.price_duzy ?? tiers.price_duzy,
    price_duzi_gracze: input.price_duzi_gracze ?? tiers.price_duzi_gracze,
    price_min: input.price_min ?? tiers.price_min,
  }
}

export async function createProduct(
  input: ProductCreateInput,
): Promise<ProductActionResult> {
  const parsed = baseSchema.safeParse(input)
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

  const filled = await applyPricing(parsed.data)
  const payload = {
    ...filled,
    owner_id: user.id,
    push_tier: parsed.data.push_tier ?? 2,
    is_hero: parsed.data.is_hero ?? false,
    tags: parsed.data.tags ?? [],
    unit: parsed.data.unit ?? 'szt',
  }

  const { data: created, error } = await supabase
    .from('products')
    .insert(payload)
    .select('id')
    .single()

  if (error || !created) {
    return { ok: false, error: error?.message ?? 'Błąd zapisu' }
  }

  revalidatePath('/products')
  return { ok: true, id: created.id }
}

export async function updateProduct(
  id: string,
  input: ProductUpdateInput,
): Promise<ProductActionResult> {
  const parsed = baseSchema.partial().safeParse(input)
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

  // Don't auto-recompute on partial update — user is editing specific
  // fields. The form decides whether to re-derive cost_pln + tiers
  // from a fresh cost_eur.
  const { error } = await supabase
    .from('products')
    .update(parsed.data)
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/products')
  revalidatePath(`/products/${id}/edit`)
  return { ok: true, id }
}

export async function deleteProduct(
  id: string,
): Promise<ProductActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/products')
  return { ok: true, id }
}

export async function getCategorySuggestions(): Promise<string[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('products')
    .select('category')
    .eq('owner_id', user.id)
    .not('category', 'is', null)

  const set = new Set<string>()
  for (const row of data ?? []) {
    const c = (row.category as string | null)?.trim()
    if (c) set.add(c)
  }
  return Array.from(set).sort()
}
