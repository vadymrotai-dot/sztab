'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

export type ParamsKeyUpdate = {
  gemini_key?: string | null
  apify_api_token?: string | null
  krs_rejestr_api_token?: string | null
}

export type ParamsKeyResult =
  | { ok: true; updated: string[] }
  | { ok: false; error: string }

// Validators are conservative — pozwalają zapisać warianty ale wyłapują
// oczywiste pomyłki. Pusty string lub null → wyczyść klucz.
function validateGemini(key: string): string | null {
  if (!key.startsWith('AIza')) return 'Klucz Gemini powinien zaczynać się od "AIza"'
  if (key.length < 35 || key.length > 50)
    return `Klucz Gemini ma nietypową długość (${key.length}, oczekiwane ~39)`
  return null
}

function validateApify(token: string): string | null {
  if (!token.startsWith('apify_api_'))
    return 'Apify token powinien zaczynać się od "apify_api_"'
  if (token.length < 30)
    return `Apify token wygląda za krótki (${token.length} znaków)`
  return null
}

function validateKrs(token: string): string | null {
  if (token.length < 20)
    return `KRS token wygląda za krótki (${token.length} znaków, min 20)`
  return null
}

export async function updateParamsKeys(
  input: ParamsKeyUpdate,
): Promise<ParamsKeyResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła.' }

  const updates: Record<string, string | null> = {}
  const updated: string[] = []

  if (input.gemini_key !== undefined) {
    const trimmed = input.gemini_key?.trim()
    if (!trimmed) {
      updates.gemini_key = null
    } else {
      const err = validateGemini(trimmed)
      if (err) return { ok: false, error: err }
      updates.gemini_key = trimmed
    }
    updated.push('gemini_key')
  }

  if (input.apify_api_token !== undefined) {
    const trimmed = input.apify_api_token?.trim()
    if (!trimmed) {
      updates.apify_api_token = null
    } else {
      const err = validateApify(trimmed)
      if (err) return { ok: false, error: err }
      updates.apify_api_token = trimmed
    }
    updated.push('apify_api_token')
  }

  if (input.krs_rejestr_api_token !== undefined) {
    const trimmed = input.krs_rejestr_api_token?.trim()
    if (!trimmed) {
      updates.krs_rejestr_api_token = null
    } else {
      const err = validateKrs(trimmed)
      if (err) return { ok: false, error: err }
      updates.krs_rejestr_api_token = trimmed
    }
    updated.push('krs_rejestr_api_token')
  }

  if (updated.length === 0) {
    return { ok: false, error: 'Brak zmian.' }
  }

  // params jest single-row table — sprawdzamy czy istnieje row dla
  // tego ownera, INSERT lub UPDATE.
  const { data: existing } = await supabase
    .from('params')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('params')
      .update(updates)
      .eq('id', existing.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase
      .from('params')
      .insert({ ...updates, owner_id: user.id })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/settings')
  return { ok: true, updated }
}

// Read masked preview (first 4 + last 4) for UI display, never returns
// the full key. RLS owner-scoped via params policy.
export interface MaskedKeys {
  gemini_key: string | null
  apify_api_token: string | null
  krs_rejestr_api_token: string | null
}

function mask(key: string | null | undefined): string | null {
  if (!key || key.length < 12) return key ?? null
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

export async function getMaskedParamsKeys(): Promise<MaskedKeys> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      gemini_key: null,
      apify_api_token: null,
      krs_rejestr_api_token: null,
    }
  }

  const { data } = await supabase
    .from('params')
    .select('gemini_key, apify_api_token, krs_rejestr_api_token')
    .eq('owner_id', user.id)
    .maybeSingle()

  return {
    gemini_key: mask(data?.gemini_key as string | null | undefined),
    apify_api_token: mask(data?.apify_api_token as string | null | undefined),
    krs_rejestr_api_token: mask(
      data?.krs_rejestr_api_token as string | null | undefined,
    ),
  }
}
