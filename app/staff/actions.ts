'use server'

// app/staff/actions.ts — samorejestracja pracownika + akcje admina.
//   requestStaffAccess   — pending user tworzy WŁASNY wiersz staff_members
//   approveStaffAccount  — admin: status='approved' + role='staff' (JWT gate)
//   rejectStaffAccount   — admin: status='rejected'
// NIGDY auto — zatwierdzenie zawsze ręczne. role='staff' nadawana DOPIERO tutaj.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasAdminAccess } from '@/lib/staff/session'

type Result = { ok: true } | { ok: false; error: string }

// ── Samorejestracja: tworzy własny wpis pending (idempotentnie) ──────────────
export async function requestStaffAccess(name: string): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('staff_members')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (existing) return { ok: true } // już w kolejce/zatwierdzony

  const { error } = await admin.from('staff_members').insert({
    auth_user_id: user.id,
    email: user.email,
    name: (name || '').trim() || null,
    status: 'pending',
    active: false,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/staff/onboard')
  return { ok: true }
}

// ── Admin gate: właściciel lub zatwierdzony pracownik ────────────────────────
async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null as null }
  if (!(await hasAdminAccess(user.id))) return { user: null as null }
  return { user }
}

export async function approveStaffAccount(id: string): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }

  const admin = createAdminClient()
  const { data: acc } = await admin
    .from('staff_members')
    .select('id, auth_user_id')
    .eq('id', id)
    .maybeSingle()
  if (!acc) return { ok: false, error: 'Konto nie znalezione' }

  const { error } = await admin
    .from('staff_members')
    .update({
      status: 'approved',
      active: true,
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  // Tag roli dla middleware (fast-path). Lag JWT gasi /staff/onboard (refreshSession).
  await admin.auth.admin.updateUserById(acc.auth_user_id as string, {
    app_metadata: { role: 'staff' },
  })

  revalidatePath('/staff-accounts')
  return { ok: true }
}

export async function rejectStaffAccount(id: string): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }

  const admin = createAdminClient()
  const { data: acc } = await admin
    .from('staff_members')
    .select('auth_user_id')
    .eq('id', id)
    .maybeSingle()

  const { error } = await admin
    .from('staff_members')
    .update({ status: 'rejected', active: false })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  // Cofnij ewentualną rolę 'staff' (gdy odrzucamy wcześniej zatwierdzonego).
  if (acc?.auth_user_id) {
    await admin.auth.admin.updateUserById(acc.auth_user_id as string, {
      app_metadata: { role: null },
    })
  }

  revalidatePath('/staff-accounts')
  return { ok: true }
}
