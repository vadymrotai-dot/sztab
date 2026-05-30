'use server'

// app/actions/client-notes.ts
// Sprint TYDZIEN2.T2.5 (29.05.2026) — write actions для client_notes
// (multi-row sales/ops notatki per klient, replacement legacy clients.notes).
//
// 3 server actions mirror app/actions/contact-methods.ts pattern:
//   - addClientNote(clientId, body)
//   - updateClientNote(noteId, body)
//   - deleteClientNote(noteId)
//
// DIFFERENCE z contact-methods:
//   - updateClientNote WRITES updated_at (migration 076 utworzyła kolumnę,
//     UI badge "(edytowano)" bazuje na updated_at - created_at > 1s).
//   - NO sync до legacy clients.notes — replacement, не mirror. Stale legacy
//     field на /clients/[id]/edit form pozostaje read-only displaying ostatnio
//     edytowaną wersję sprzed T2.5 (deprecate w T2.6+).
//   - NO is_primary / pinned (decision sprint).
//   - NO source provenance (wszystko 'manual' implicitly).
//
// NON-GOALS T2.5:
//   - NO Markdown render (UI whitespace-pre-wrap)
//   - NO search/filter
//   - NO pin/star
//   - NO nullify clients.notes after seed (defer T2.6+)

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

// ─── Schemas ─────────────────────────────────────────────────────────

const MAX_BODY = 5000

// Sprint TYDZIEN2.T2.6 (29.05.2026) — kind + occurred_at extension.
// Migration 077 added: kind TEXT CHECK + occurred_at TIMESTAMPTZ NULL.
// Schema-level enum matches DB CHECK constraint exactly.
const KIND_VALUES = ['note', 'call', 'meeting', 'order_followup'] as const
const kindEnum = z.enum(KIND_VALUES)

// .trim() przed .min/.max — empty whitespace=invalid, długość liczona
// po trim (consistent z DB CHECK length(body) BETWEEN 1 AND 5000 +
// preventing user paste z accidental trailing whitespace overflowing).
const addSchema = z.object({
  clientId: z.string().uuid('Nieprawidłowy clientId'),
  body: z
    .string()
    .trim()
    .min(1, 'Treść wymagana')
    .max(MAX_BODY, `Notatka za długa (max ${MAX_BODY} znaków)`),
  // T2.6 — kind optional w schemacie, default 'note' (DB DEFAULT pokrywa
  // gdy server-side action nie wysyła kind, ale Zod wymusza enum jeśli set).
  kind: kindEnum.optional(),
  // T2.6 — occurred_at ISO string, optional. NULL = fallback do created_at.
  // Format datetime ISO 8601 (datetime-local input zwraca bez TZ, server
  // dodaje 'Z' = UTC traktowanie, accepts both formats).
  occurredAt: z.string().datetime({ offset: true }).optional().nullable(),
})

const updateSchema = z.object({
  noteId: z.string().uuid('Nieprawidłowy noteId'),
  body: z
    .string()
    .trim()
    .min(1, 'Treść wymagana')
    .max(MAX_BODY, `Notatka za długa (max ${MAX_BODY} znaków)`),
})

const idSchema = z.object({ noteId: z.string().uuid('Nieprawidłowy noteId') })

// ─── Result type ─────────────────────────────────────────────────────

export type ClientNoteActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

// ─── Action 1: addClientNote ─────────────────────────────────────────

export async function addClientNote(
  clientId: string,
  body: string,
  // Sprint TYDZIEN2.T2.6 (29.05.2026) — optional kind + occurredAt.
  // Backward-compat: T2.5 callers (ClientNoteForm add) wywołują z 2 args,
  // dostają kind='note' DEFAULT z DB + occurred_at=NULL → UI fallback do
  // created_at. T2.6 timeline form sends both.
  kind?: 'note' | 'call' | 'meeting' | 'order_followup',
  occurredAt?: string | null,
): Promise<ClientNoteActionResult> {
  const parsed = addSchema.safeParse({
    clientId,
    body,
    kind: kind ?? undefined,
    occurredAt: occurredAt ?? null,
  })
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

  // Build INSERT payload — kind/occurred_at only included gdy explicitly
  // wysłane (DB DEFAULT 'note' i NULL pokryją reszta).
  const payload: Record<string, unknown> = {
    client_id: parsed.data.clientId,
    owner_id: user.id,
    body: parsed.data.body,
    // created_at + updated_at fill via DEFAULT NOW() (migration 076).
  }
  if (parsed.data.kind) payload.kind = parsed.data.kind
  if (parsed.data.occurredAt) payload.occurred_at = parsed.data.occurredAt

  const { data: inserted, error: insertErr } = await supabase
    .from('client_notes')
    .insert(payload)
    .select('id')
    .single()

  if (insertErr) {
    return { ok: false, error: insertErr.message }
  }

  revalidatePath(`/clients/${parsed.data.clientId}`)
  return { ok: true, id: (inserted as { id: string }).id }
}

// ─── Action 2: updateClientNote ──────────────────────────────────────

export async function updateClientNote(
  noteId: string,
  body: string,
): Promise<ClientNoteActionResult> {
  const parsed = updateSchema.safeParse({ noteId, body })
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

  // SELECT client_id (для revalidate) + RLS ownership pre-check. .maybeSingle()
  // zwraca null gdy not found (zamiast PGRST error) → friendly message.
  const { data: row, error: readErr } = await supabase
    .from('client_notes')
    .select('client_id')
    .eq('id', parsed.data.noteId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!row) return { ok: false, error: 'Notatka nie znaleziona albo brak dostępu' }
  const clientId = (row as { client_id: string }).client_id

  // updated_at writes NOW() — column EXISTS w migration 076 (unlike ccm).
  // UI badge "(edytowano)" bazuje na (updated_at - created_at > 1s).
  const { error: updErr } = await supabase
    .from('client_notes')
    .update({
      body: parsed.data.body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.noteId)
    .eq('owner_id', user.id)
  if (updErr) return { ok: false, error: updErr.message }

  revalidatePath(`/clients/${clientId}`)
  return { ok: true, id: parsed.data.noteId }
}

// ─── Action 3: deleteClientNote ──────────────────────────────────────

export async function deleteClientNote(
  noteId: string,
): Promise<ClientNoteActionResult> {
  const parsed = idSchema.safeParse({ noteId })
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Nieprawidłowy noteId',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  // SELECT client_id (для revalidate) + ownership pre-check. RLS защищає,
  // ale explicit .eq('owner_id') wymusza row visibility перед .delete().
  const { data: row, error: readErr } = await supabase
    .from('client_notes')
    .select('client_id')
    .eq('id', parsed.data.noteId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!row) return { ok: false, error: 'Notatka nie znaleziona albo brak dostępu' }
  const clientId = (row as { client_id: string }).client_id

  const { error: delErr } = await supabase
    .from('client_notes')
    .delete()
    .eq('id', parsed.data.noteId)
    .eq('owner_id', user.id)
  if (delErr) return { ok: false, error: delErr.message }

  revalidatePath(`/clients/${clientId}`)
  return { ok: true, id: parsed.data.noteId }
}
