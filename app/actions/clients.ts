'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

const clientTypeEnum = z.enum(['standard', 'strategic_partner'])

const baseSchema = z.object({
  title: z.string().min(2, 'Nazwa wymagana (min 2 znaki)'),
  nip: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  segment: z
    .enum(['maly', 'sredni', 'duzy', 'duzi_gracze', 'niesklasyfikowany'])
    .optional()
    .nullable(),
  status: z.enum(['nowy', 'aktywny', 'nieaktywny']).optional().nullable(),
  channel_type: z.string().optional().nullable(),
  size_tier: z.string().optional().nullable(),
  client_type: clientTypeEnum.optional(),
  contracted_margin_katalog_pct: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .nullable(),
  contracted_margin_docel_pct: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .nullable(),
})

export type ClientCreateInput = z.infer<typeof baseSchema>
export type ClientUpdateInput = Partial<ClientCreateInput>

export type ClientActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

const validateStrategicPartner = (
  input: ClientCreateInput | ClientUpdateInput,
): string | null => {
  if (input.client_type === 'strategic_partner') {
    const k = input.contracted_margin_katalog_pct
    const d = input.contracted_margin_docel_pct
    if (k == null || d == null) {
      return 'Strategic partner wymaga obu marż: katalog + docel'
    }
    if (d > k) {
      return 'Marża docel musi być ≤ marża katalog'
    }
  }
  return null
}

export async function createClientRecord(
  input: ClientCreateInput,
): Promise<ClientActionResult> {
  const parsed = baseSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane',
    }
  }
  const partnerErr = validateStrategicPartner(parsed.data)
  if (partnerErr) return { ok: false, error: partnerErr }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const payload = {
    ...parsed.data,
    client_type: parsed.data.client_type ?? 'standard',
    segment: parsed.data.segment ?? 'niesklasyfikowany',
    status: parsed.data.status ?? 'nowy',
    owner_id: user.id,
  }

  const { data: created, error } = await supabase
    .from('clients')
    .insert(payload)
    .select('id')
    .single()

  if (error || !created) {
    return { ok: false, error: error?.message ?? 'Błąd zapisu' }
  }

  revalidatePath('/clients')
  return { ok: true, id: created.id }
}

export async function updateClientRecord(
  id: string,
  input: ClientUpdateInput,
): Promise<ClientActionResult> {
  const parsed = baseSchema.partial().safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane',
    }
  }
  const partnerErr = validateStrategicPartner(parsed.data)
  if (partnerErr) return { ok: false, error: partnerErr }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const { error } = await supabase
    .from('clients')
    .update(parsed.data)
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  revalidatePath(`/clients/${id}/edit`)
  return { ok: true, id }
}

export async function deleteClientRecord(
  id: string,
): Promise<ClientActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/clients')
  return { ok: true, id }
}

// Toggle between 'standard' and 'strategic_partner'. When promoting to
// strategic_partner the caller must supply both contracted margins.
export async function toggleClientType(
  id: string,
  newType: 'standard' | 'strategic_partner',
  marginKatalog?: number,
  marginDocel?: number,
): Promise<ClientActionResult> {
  if (newType === 'strategic_partner') {
    if (marginKatalog == null || marginDocel == null) {
      return {
        ok: false,
        error: 'Strategic partner wymaga obu marż: katalog + docel',
      }
    }
    if (marginDocel > marginKatalog) {
      return { ok: false, error: 'Marża docel musi być ≤ marża katalog' }
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const payload =
    newType === 'strategic_partner'
      ? {
          client_type: 'strategic_partner',
          contracted_margin_katalog_pct: marginKatalog,
          contracted_margin_docel_pct: marginDocel,
        }
      : {
          client_type: 'standard',
          contracted_margin_katalog_pct: null,
          contracted_margin_docel_pct: null,
        }

  const { error } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  revalidatePath(`/clients/${id}/edit`)
  return { ok: true, id }
}
