'use server'

// lib/actions/cohorts.ts
// Phase 2 Krok 1.C1 (08.05.2026 evening) — server actions для cohort management.
//
// Tables: cohorts + cohort_members (migration 060).
// RLS: shared 'authenticated' policy — будь-який user може CRUD (single-user
// poki co; multi-user upgrade пізніше per Vadym Q2).
//
// Polymorphic FK pattern: cohort_members.subject_type ∈ {'prospect', 'client'},
// subject_id = UUID. Krok 1.C1 = prospect side тільки. Client side у Krok 1.C2.
//
// 2-step INSERT pattern для idempotency (per Protocol 17 — Supabase JS .upsert()
// з partial unique indices unreliable; composite PK should work але 2-step
// безпечніший і consistent з Phase 2.8 lessons learned).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const NAME_MAX = 100
const DESC_MAX = 500

// ─── Types ────────────────────────────────────────────────────────

export interface CohortRow {
  id: string
  name: string
  description: string | null
  created_at: string
  created_by_user_id: string | null
}

export interface CohortMemberRow {
  cohort_id: string
  subject_type: 'prospect' | 'client'
  subject_id: string
  added_at: string
  status:
    | 'pending'
    | 'called'
    | 'interested'
    | 'not_interested'
    | 'callback'
  notes: string | null
}

// ─── createCohort ────────────────────────────────────────────────

/** Create a new cohort. Validates name length + uniqueness. Sets created_by
 *  to current user.id (auth.users). Returns minimal {id, name}. */
export async function createCohort(
  name: string,
  description?: string,
): Promise<{ id: string; name: string }> {
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Nazwa cohortу nie może być pusta')
  if (trimmedName.length > NAME_MAX) {
    throw new Error(`Nazwa max ${NAME_MAX} znaków (${trimmedName.length})`)
  }
  const trimmedDesc = description?.trim() ?? null
  if (trimmedDesc && trimmedDesc.length > DESC_MAX) {
    throw new Error(`Opis max ${DESC_MAX} znaków (${trimmedDesc.length})`)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('cohorts')
    .insert({
      name: trimmedName,
      description: trimmedDesc,
      created_by_user_id: user?.id ?? null,
    })
    .select('id, name')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Cohort "${trimmedName}" już istnieje`)
    }
    throw new Error(error.message)
  }

  revalidatePath('/intelligence/cohorts')
  revalidatePath('/intelligence/prospects')
  return { id: data.id as string, name: data.name as string }
}

// ─── deleteCohort ────────────────────────────────────────────────

/** Hard delete cohort. ON DELETE CASCADE drops cohort_members automatically
 *  (per migration 060 FK definition). */
export async function deleteCohort(cohortId: string): Promise<{ ok: true }> {
  if (!cohortId) throw new Error('cohortId required')

  const supabase = await createClient()
  const { error } = await supabase.from('cohorts').delete().eq('id', cohortId)
  if (error) throw new Error(error.message)

  revalidatePath('/intelligence/cohorts')
  revalidatePath('/intelligence/prospects')
  return { ok: true }
}

// ─── addProspectsToCohort ────────────────────────────────────────

/** Idempotent add — pre-check existing memberships, INSERT only new rows.
 *  Returns count summary. Empty input → no-op.
 *
 *  2-step pattern (per Protocol 17): Supabase JS .upsert() з composite PK
 *  у теорії works, але pre-Phase 2.8 fail на partial unique indices left
 *  trust issue. Pre-check + insert is reliable і comparable performance
 *  для typical 5-50 row payloads (Lista 50 use case). */
export async function addProspectsToCohort(
  cohortId: string,
  prospectIds: string[],
): Promise<{ added: number; skipped: number }> {
  if (!cohortId) throw new Error('cohortId required')
  if (prospectIds.length === 0) return { added: 0, skipped: 0 }

  // Dedupe input array (defensive)
  const uniqueIds = Array.from(new Set(prospectIds))

  const supabase = await createClient()

  // Step 1 — pre-check existing memberships (composite PK lookup)
  const { data: existing, error: selErr } = await supabase
    .from('cohort_members')
    .select('subject_id')
    .eq('cohort_id', cohortId)
    .eq('subject_type', 'prospect')
    .in('subject_id', uniqueIds)

  if (selErr) throw new Error(`Pre-check failed: ${selErr.message}`)

  const existingSet = new Set(
    (existing ?? []).map((r) => r.subject_id as string),
  )
  const newRows = uniqueIds
    .filter((id) => !existingSet.has(id))
    .map((id) => ({
      cohort_id: cohortId,
      subject_type: 'prospect' as const,
      subject_id: id,
    }))

  // Step 2 — INSERT only new rows
  if (newRows.length > 0) {
    const { error: insErr } = await supabase
      .from('cohort_members')
      .insert(newRows)
    if (insErr) throw new Error(`Insert failed: ${insErr.message}`)
  }

  revalidatePath(`/intelligence/cohorts/${cohortId}`)
  revalidatePath('/intelligence/cohorts')
  revalidatePath('/intelligence/prospects')
  return { added: newRows.length, skipped: existingSet.size }
}

// ─── addClientsToCohort ──────────────────────────────────────────

/** Phase 2 Krok 1.C2 (08.05.2026) — clients side parallel до prospects.
 *  Same 2-step idempotent pattern. subject_type='client' branch of
 *  polymorphic FK у cohort_members.
 *
 *  Caller (clients/bulk-action-bar.tsx) повинен pre-filter selected IDs
 *  щоб тільки entity_type='client' rows потрапляли — entity_type='prospect'
 *  rows у тій самій clients table мали б ходити через addProspectsToCohort
 *  flow (але вони CEIDG-derived, тому не пересікаються; safety filter
 *  у bulk-action-bar). */
export async function addClientsToCohort(
  cohortId: string,
  clientIds: string[],
): Promise<{ added: number; skipped: number }> {
  if (!cohortId) throw new Error('cohortId required')
  if (clientIds.length === 0) return { added: 0, skipped: 0 }

  const uniqueIds = Array.from(new Set(clientIds))
  const supabase = await createClient()

  // Step 1 — pre-check existing memberships
  const { data: existing, error: selErr } = await supabase
    .from('cohort_members')
    .select('subject_id')
    .eq('cohort_id', cohortId)
    .eq('subject_type', 'client')
    .in('subject_id', uniqueIds)

  if (selErr) throw new Error(`Pre-check failed: ${selErr.message}`)

  const existingSet = new Set(
    (existing ?? []).map((r) => r.subject_id as string),
  )
  const newRows = uniqueIds
    .filter((id) => !existingSet.has(id))
    .map((id) => ({
      cohort_id: cohortId,
      subject_type: 'client' as const,
      subject_id: id,
    }))

  // Step 2 — INSERT only new rows
  if (newRows.length > 0) {
    const { error: insErr } = await supabase
      .from('cohort_members')
      .insert(newRows)
    if (insErr) throw new Error(`Insert failed: ${insErr.message}`)
  }

  revalidatePath(`/intelligence/cohorts/${cohortId}`)
  revalidatePath('/intelligence/cohorts')
  revalidatePath('/clients')
  return { added: newRows.length, skipped: existingSet.size }
}

// ─── Phase 2 Krok 1.D1 — status mutation + notes edit ────────────

const NOTES_MAX = 200

export type CohortMemberStatus =
  | 'pending'
  | 'called'
  | 'interested'
  | 'not_interested'
  | 'callback'

const VALID_STATUSES: CohortMemberStatus[] = [
  'pending',
  'called',
  'interested',
  'not_interested',
  'callback',
]

/** Composite PK identifier (per migration 060 PRIMARY KEY).
 *  Per Krok 1.D1 Q2=B2 — NIE schema change, keep tuple keys. */
export interface MemberKey {
  cohort_id: string
  subject_type: 'prospect' | 'client'
  subject_id: string
}

function validateStatus(s: string): CohortMemberStatus {
  if (!VALID_STATUSES.includes(s as CohortMemberStatus)) {
    throw new Error(`Invalid status: "${s}"`)
  }
  return s as CohortMemberStatus
}

// ─── updateCohortMemberStatus ────────────────────────────────────

/** Single-row status mutation. Composite WHERE on PK tuple. */
export async function updateCohortMemberStatus(
  key: MemberKey,
  status: CohortMemberStatus,
): Promise<{ ok: true }> {
  const validStatus = validateStatus(status)
  if (!key.cohort_id || !key.subject_type || !key.subject_id) {
    throw new Error('MemberKey requires cohort_id, subject_type, subject_id')
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cohort_members')
    .update({ status: validStatus })
    .eq('cohort_id', key.cohort_id)
    .eq('subject_type', key.subject_type)
    .eq('subject_id', key.subject_id)

  if (error) throw new Error(`Status update failed: ${error.message}`)

  revalidatePath(`/intelligence/cohorts/${key.cohort_id}`)
  return { ok: true }
}

// ─── updateCohortMemberNotes ─────────────────────────────────────

/** Single-row notes mutation. Pre-existing 'notes' column (з 's') used
 *  per Krok 1.D1 Q1=A1 — NIE додаємо 'note' без 's'. */
export async function updateCohortMemberNotes(
  key: MemberKey,
  notes: string | null,
): Promise<{ ok: true }> {
  if (!key.cohort_id || !key.subject_type || !key.subject_id) {
    throw new Error('MemberKey requires cohort_id, subject_type, subject_id')
  }

  const trimmed = notes?.trim() ?? null
  if (trimmed && trimmed.length > NOTES_MAX) {
    throw new Error(`Notatka max ${NOTES_MAX} znaków (${trimmed.length})`)
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cohort_members')
    .update({ notes: trimmed && trimmed.length > 0 ? trimmed : null })
    .eq('cohort_id', key.cohort_id)
    .eq('subject_type', key.subject_type)
    .eq('subject_id', key.subject_id)

  if (error) throw new Error(`Notes update failed: ${error.message}`)

  revalidatePath(`/intelligence/cohorts/${key.cohort_id}`)
  return { ok: true }
}

// ─── bulkUpdateCohortMemberStatus ────────────────────────────────

/** Bulk status mutation. Composite tuple IN не natively supported у
 *  Supabase JS, тому 2 окремі UPDATE statements per subject_type
 *  (per Vadym additional clarification #1). Returns sum of affected. */
export async function bulkUpdateCohortMemberStatus(
  keys: MemberKey[],
  status: CohortMemberStatus,
): Promise<{ updated: number }> {
  const validStatus = validateStatus(status)
  if (keys.length === 0) return { updated: 0 }
  if (keys.length > 200) {
    throw new Error(`Bulk update max 200 rows (otrzymano ${keys.length})`)
  }

  // Group by cohort_id + subject_type for IN clauses
  const byCohort = new Map<string, { prospect: string[]; client: string[] }>()
  for (const k of keys) {
    if (!byCohort.has(k.cohort_id)) {
      byCohort.set(k.cohort_id, { prospect: [], client: [] })
    }
    const bucket = byCohort.get(k.cohort_id)!
    if (k.subject_type === 'prospect') bucket.prospect.push(k.subject_id)
    else if (k.subject_type === 'client') bucket.client.push(k.subject_id)
  }

  const supabase = await createClient()
  let totalUpdated = 0

  for (const [cohortId, bucket] of byCohort) {
    if (bucket.prospect.length > 0) {
      const { error, count } = await supabase
        .from('cohort_members')
        .update({ status: validStatus }, { count: 'exact' })
        .eq('cohort_id', cohortId)
        .eq('subject_type', 'prospect')
        .in('subject_id', bucket.prospect)
      if (error) {
        throw new Error(`Bulk update (prospect) failed: ${error.message}`)
      }
      totalUpdated += count ?? 0
    }
    if (bucket.client.length > 0) {
      const { error, count } = await supabase
        .from('cohort_members')
        .update({ status: validStatus }, { count: 'exact' })
        .eq('cohort_id', cohortId)
        .eq('subject_type', 'client')
        .in('subject_id', bucket.client)
      if (error) {
        throw new Error(`Bulk update (client) failed: ${error.message}`)
      }
      totalUpdated += count ?? 0
    }
    revalidatePath(`/intelligence/cohorts/${cohortId}`)
  }

  return { updated: totalUpdated }
}
