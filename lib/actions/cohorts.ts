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
