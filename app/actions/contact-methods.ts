'use server'

// app/actions/contact-methods.ts
// Sprint TYDZIEN2.T2.4.C1 (28.05.2026) — write actions для
// client_contact_methods (multi-row firm contact methods).
//
// 3 server actions:
//   - addContactMethod(clientId, kind, value, label?)
//   - deleteContactMethod(methodId)
//   - setPrimaryContactMethod(methodId)
//
// Pattern follows app/actions/clients.ts: Zod schema → auth.getUser →
// owner_id → INSERT/UPDATE → revalidatePath → discriminated union return.
//
// Primary toggle = ATOMIC single-statement UPDATE (constraint-safe з partial
// unique index `idx_ccm_one_primary`). Sync до clients.{kind} sequential
// (Phase 2 = DB trigger, defer).
//
// NON-GOALS T2.4.C1:
//   - NO edit value/label (T2.4.C2)
//   - NO phone normalize
//   - NO ccm → cpf writeback

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

// ─── Schemas ─────────────────────────────────────────────────────────

const KIND_VALUES = [
  'email',
  'phone',
  'website',
  'facebook',
  'instagram',
  'linkedin',
  'other',
] as const

const kindEnum = z.enum(KIND_VALUES)

// Loose email regex (per decision 4) — basic format только.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const addSchema = z.object({
  clientId: z.string().uuid('Nieprawidłowy clientId'),
  kind: kindEnum,
  value: z.string().min(1, 'Wartość wymagana').max(500, 'Wartość za długa'),
  label: z.string().max(50).optional().nullable(),
})

const idSchema = z.object({ methodId: z.string().uuid('Nieprawidłowy methodId') })

// Sprint TYDZIEN2.T2.4.C2 (28.05.2026) — update schema. methodId required,
// value+label оба supplied always (form sends current state, не diff).
const updateSchema = z.object({
  methodId: z.string().uuid('Nieprawidłowy methodId'),
  value: z.string().min(1, 'Wartość wymagana').max(500, 'Wartość za długa'),
  label: z.string().max(50).optional().nullable(),
})

// ─── Result type ─────────────────────────────────────────────────────

export type ContactMethodActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

// ─── Helpers ─────────────────────────────────────────────────────────

/** Loose value validation per kind (Phase 1).
 *  - email: must match EMAIL_RE
 *  - website/facebook/instagram/linkedin: auto-prepend https:// if missing
 *  - phone/other: trim only
 *  Returns normalized value albo error message. */
function validateAndNormalize(
  kind: (typeof KIND_VALUES)[number],
  rawValue: string,
): { value: string } | { error: string } {
  const trimmed = rawValue.trim()
  if (!trimmed) return { error: 'Wartość pusta po trim' }

  if (kind === 'email') {
    if (!EMAIL_RE.test(trimmed)) {
      return { error: 'Nieprawidłowy format email' }
    }
    return { value: trimmed }
  }

  if (kind === 'website' || kind === 'facebook' || kind === 'instagram' || kind === 'linkedin') {
    // Auto-prepend https:// якщо нема scheme. Decision: preserve original case
    // у value (z user input) — dedupe via UNIQUE INDEX porównuje raw.
    if (!/^https?:\/\//i.test(trimmed)) {
      return { value: `https://${trimmed}` }
    }
    return { value: trimmed }
  }

  // phone / other — preserve as-is (decision 5: NO phone normalize)
  return { value: trimmed }
}

// ─── Action 1: addContactMethod ──────────────────────────────────────

export async function addContactMethod(
  clientId: string,
  kind: string,
  value: string,
  label?: string | null,
): Promise<ContactMethodActionResult> {
  const parsed = addSchema.safeParse({ clientId, kind, value, label: label ?? null })
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Nieprawidłowe dane',
    }
  }

  const normResult = validateAndNormalize(parsed.data.kind, parsed.data.value)
  if ('error' in normResult) return { ok: false, error: normResult.error }
  const normalizedValue = normResult.value

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  // Determine is_primary: TRUE якщо це pierwszy method tego kind dla клiента.
  // RLS auth.uid()=owner_id zapewnia że вернe тільки własні rows.
  const { count: existingCount, error: countErr } = await supabase
    .from('client_contact_methods')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', parsed.data.clientId)
    .eq('kind', parsed.data.kind)
  if (countErr) {
    return { ok: false, error: `Błąd liczenia metod: ${countErr.message}` }
  }
  const isPrimary = (existingCount ?? 0) === 0

  const { data: inserted, error: insertErr } = await supabase
    .from('client_contact_methods')
    .insert({
      client_id: parsed.data.clientId,
      owner_id: user.id,
      kind: parsed.data.kind,
      value: normalizedValue,
      label: parsed.data.label && parsed.data.label.length > 0 ? parsed.data.label : null,
      is_primary: isPrimary,
      source: 'manual',
    })
    .select('id')
    .single()

  if (insertErr) {
    // Postgres unique violation = 23505. Supabase wraps у error.code.
    if (insertErr.code === '23505') {
      return { ok: false, error: 'Taki kontakt już istnieje na liście' }
    }
    return { ok: false, error: insertErr.message }
  }

  revalidatePath(`/clients/${parsed.data.clientId}`)
  return { ok: true, id: (inserted as { id: string }).id }
}

// ─── Action 2: deleteContactMethod ───────────────────────────────────

export async function deleteContactMethod(
  methodId: string,
): Promise<ContactMethodActionResult> {
  const parsed = idSchema.safeParse({ methodId })
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Nieprawidłowy methodId',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  // Read client_id przed delete (dla revalidatePath). RLS zapewnia ownership.
  const { data: row, error: readErr } = await supabase
    .from('client_contact_methods')
    .select('client_id')
    .eq('id', parsed.data.methodId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!row) return { ok: false, error: 'Metoda nie znaleziona albo brak dostępu' }
  const clientId = (row as { client_id: string }).client_id

  const { error: delErr } = await supabase
    .from('client_contact_methods')
    .delete()
    .eq('id', parsed.data.methodId)
    .eq('owner_id', user.id)
  if (delErr) return { ok: false, error: delErr.message }

  // Decision 8: NIE торкаємо clients.* — orphan stays. ⭐ toggle na pozostałym
  // method (якщо є) синхронізує. Якщо primary deleted i немає replacement —
  // list /clients pokaże stale value. User re-add OR existing other method
  // promoted manually.
  revalidatePath(`/clients/${clientId}`)
  return { ok: true, id: parsed.data.methodId }
}

// ─── Action 3: setPrimaryContactMethod ───────────────────────────────

export async function setPrimaryContactMethod(
  methodId: string,
): Promise<ContactMethodActionResult> {
  const parsed = idSchema.safeParse({ methodId })
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Nieprawidłowy methodId',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  // Sprint TYDZIEN2.T2.4.C1 FIX2 (28.05.2026) — atomic primary toggle via RPC
  // з explicit p_owner_id (NIE auth.uid() bo пропадає у server-action RPC
  // context u @supabase/ssr).
  //
  // Migration 075 (FIX2 version): function приймає (p_method_id, p_owner_id)
  // і robi ONE UPDATE: SET is_primary = (id = p_method_id) WHERE client_id+
  // kind+owner_id=p_owner_id. Partial UNIQUE INDEX idx_ccm_one_primary
  // checked at end of statement — race-safe.
  //
  // p_owner_id = user.id з auth.getUser() (validated wyżej). Server-side
  // resolve, NIE z client request body — bezpieczne.
  //
  // RPC returns { client_id, kind, value, ok, error } — caller robi clients sync.
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    'set_primary_contact_method',
    { p_method_id: parsed.data.methodId, p_owner_id: user.id },
  )
  if (rpcErr) return { ok: false, error: `RPC error: ${rpcErr.message}` }

  type RpcRow = {
    client_id: string | null
    kind: string | null
    value: string | null
    ok: boolean
    error: string | null
  }
  const row = ((rpcData ?? []) as RpcRow[])[0]
  if (!row) return { ok: false, error: 'RPC zwróciło 0 rows (unexpected)' }
  if (!row.ok || !row.client_id || !row.kind || row.value === null) {
    return {
      ok: false,
      error:
        row.error === 'not_found_or_unauthorized'
          ? 'Metoda nie znaleziona albo brak dostępu'
          : row.error === 'unauthenticated'
            ? 'Sesja wygasła'
            : row.error ?? 'Nieznany błąd RPC',
    }
  }

  const clientId = row.client_id
  const kind = row.kind
  const value = row.value

  // Sync do clients.{kind} dla list /clients (kind IN email/phone/website).
  // Phase 1: sequential UPDATE (poza transaction RPC). Jeśli fail — re-click
  // recovers, ccm уже updated. Phase 2: DB trigger (defer).
  if (kind === 'email' || kind === 'phone' || kind === 'website') {
    const { error: syncErr } = await supabase
      .from('clients')
      .update({ [kind]: value, updated_at: new Date().toISOString() })
      .eq('id', clientId)
      .eq('owner_id', user.id)
    if (syncErr) {
      // Non-fatal: ccm уже updated, тільки list cache stale do reload.
      console.error('[setPrimary] clients sync failed:', syncErr.message)
    }
  }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/clients')
  return { ok: true, id: parsed.data.methodId }
}

// ─── Action 4: updateContactMethod (T2.4.C2) ─────────────────────────

export async function updateContactMethod(
  methodId: string,
  value: string,
  label: string | null,
): Promise<ContactMethodActionResult> {
  const parsed = updateSchema.safeParse({ methodId, value, label: label ?? null })
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

  // SELECT method aby dostać kind + is_primary + old_value (dla sync decision)
  // i client_id (revalidatePath target). RLS .eq('owner_id') zabezpiecza.
  const { data: row, error: readErr } = await supabase
    .from('client_contact_methods')
    .select('client_id, kind, value, is_primary')
    .eq('id', parsed.data.methodId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!row) return { ok: false, error: 'Metoda nie znaleziona albo brak dostępu' }

  const {
    client_id: clientId,
    kind,
    value: oldValue,
    is_primary: isPrimary,
  } = row as {
    client_id: string
    kind: string
    value: string
    is_primary: boolean
  }

  // Validate + normalize new value per kind (reuse helper z addContactMethod).
  const normResult = validateAndNormalize(
    kind as (typeof KIND_VALUES)[number],
    parsed.data.value,
  )
  if ('error' in normResult) return { ok: false, error: normResult.error }
  const normalizedValue = normResult.value

  const trimmedLabel =
    parsed.data.label && parsed.data.label.trim().length > 0
      ? parsed.data.label.trim()
      : null

  // UPDATE з RLS defense (owner_id eq) + dedup catch via UNIQUE INDEX
  // idx_ccm_dedup (client_id, kind, value). Postgres 23505 → user-friendly.
  // Self-edit (same value) does NOT trigger 23505 — Postgres no-op detect.
  // Sprint TYDZIEN2.T2.4.C2 BUGFIX (28.05.2026) — usunięto `updated_at` z
  // payload. Migration 074 NIE utworzyła tej kolumny w client_contact_methods
  // (tylko created_at). PostgREST zwracał PGRST204 → updErr → {ok:false}.
  // Consistent z addContactMethod (теж не writes updated_at).
  const { error: updErr } = await supabase
    .from('client_contact_methods')
    .update({
      value: normalizedValue,
      label: trimmedLabel,
    })
    .eq('id', parsed.data.methodId)
    .eq('owner_id', user.id)
  if (updErr) {
    if (updErr.code === '23505') {
      return { ok: false, error: 'Taka wartość już istnieje na liście' }
    }
    return { ok: false, error: updErr.message }
  }

  // Sync clients.{kind} ТІЛЬКИ jeśli ВСІ 3 conditions match:
  //   - row była primary (UPDATE не змінює is_primary, тільки value/label),
  //   - kind ∈ {email, phone, website} (тільки ці колонки клонуються до clients),
  //   - value реально змінився (skip sync якщо edited тільки label).
  // Non-fatal на error — UI re-fetch покаже actual ccm state.
  if (
    isPrimary &&
    (kind === 'email' || kind === 'phone' || kind === 'website') &&
    oldValue !== normalizedValue
  ) {
    const { error: syncErr } = await supabase
      .from('clients')
      .update({ [kind]: normalizedValue, updated_at: new Date().toISOString() })
      .eq('id', clientId)
      .eq('owner_id', user.id)
    if (syncErr) {
      console.error('[updateContactMethod] clients sync failed:', syncErr.message)
    }
  }

  revalidatePath(`/clients/${clientId}`)
  if (isPrimary) revalidatePath('/clients')
  return { ok: true, id: parsed.data.methodId }
}
