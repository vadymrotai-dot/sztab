'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

const supplierTypeEnum = z.enum([
  'producent',
  'trader',
  'posrednik',
  'wlasna_marka',
])
const dealTypeEnum = z.enum(['reseller', 'agent', 'partner'])

const baseSchema = z.object({
  name: z.string().min(2, 'Nazwa wymagana (min 2 znaki)'),
  legal_name: z.string().nullable().optional(),
  type: supplierTypeEnum,
  deal_type: dealTypeEnum,
  commission_pct: z
    .number()
    .min(0, 'Prowizja musi być >= 0')
    .max(100, 'Prowizja musi być <= 100')
    .nullable()
    .optional(),
  verticals: z.array(z.string()).nullable().optional(),
  exclusivity_scope: z.array(z.string()).nullable().optional(),
  exclusive_territory: z.string().nullable().optional(),
  exclusive_until: z.string().nullable().optional(),
  payment_terms: z.string().nullable().optional(),
  moq_value: z.number().min(0).nullable().optional(),
  lead_time_days: z.number().int().min(0).max(365).nullable().optional(),
  reliability_score: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().nullable().optional(),
})

export type SupplierActionInput = z.infer<typeof baseSchema>
export type SupplierActionPartial = Partial<SupplierActionInput>

export type SupplierActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

const enforceCommissionRule = (
  data: SupplierActionInput | SupplierActionPartial,
): Record<string, unknown> => {
  // Agent: commission_pct must be present. Reseller/partner: null it out so
  // the DB never carries a stale percentage on a non-agent row.
  if (data.deal_type === 'agent') {
    if (data.commission_pct == null) {
      throw new Error('Prowizja wymagana dla typu Agent')
    }
    return { ...data }
  }
  if (data.deal_type === 'reseller' || data.deal_type === 'partner') {
    return { ...data, commission_pct: null }
  }
  return { ...data }
}

export async function createSupplier(
  input: SupplierActionInput,
): Promise<SupplierActionResult> {
  const parsed = baseSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane',
    }
  }

  let payload: Record<string, unknown>
  try {
    payload = enforceCommissionRule(parsed.data)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const { data: created, error } = await supabase
    .from('suppliers')
    .insert({ ...payload, owner_id: user.id })
    .select('id')
    .single()

  if (error || !created) {
    return { ok: false, error: error?.message ?? 'Błąd zapisu' }
  }

  revalidatePath('/suppliers')
  return { ok: true, id: created.id }
}

export async function updateSupplier(
  id: string,
  input: SupplierActionPartial,
): Promise<SupplierActionResult> {
  const parsed = baseSchema.partial().safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane',
    }
  }

  let payload: Record<string, unknown>
  try {
    payload = enforceCommissionRule(parsed.data)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  payload.updated_at = new Date().toISOString()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const { error } = await supabase
    .from('suppliers')
    .update(payload)
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/suppliers')
  revalidatePath(`/suppliers/${id}/edit`)
  return { ok: true, id }
}

export async function deleteSupplier(
  id: string,
): Promise<SupplierActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const { error } = await supabase
    .from('suppliers')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/suppliers')
  return { ok: true, id }
}
