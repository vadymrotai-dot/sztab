'use server'

// app/actions/portal-admin.ts — Portal klienta Faza 0, akcje admina (Vadym).
// Ręczne zatwierdzanie / odrzucanie kont portalowych. NIGDY auto.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPortalUser } from '@/lib/portal/session'

type Result = { ok: true } | { ok: false; error: string }

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null as null }
  // Portal-user NIE może wywoływać akcji admina.
  if (await isPortalUser(user.id)) return { user: null as null }
  return { user }
}

export async function approvePortalAccount(
  id: string,
  clientId: string,
): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const cid = (clientId || '').trim()
  if (!cid) return { ok: false, error: 'Brak client_id do powiązania' }

  const admin = createAdminClient()
  // Walidacja: klient istnieje.
  const { data: cli } = await admin
    .from('clients')
    .select('id')
    .eq('id', cid)
    .maybeSingle()
  if (!cli) return { ok: false, error: 'Klient o tym id nie istnieje' }

  const { error } = await admin
    .from('client_portal_accounts')
    .update({
      client_id: cid,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/portal-accounts')
  return { ok: true }
}

export async function rejectPortalAccount(id: string): Promise<Result> {
  const { user } = await requireAdmin()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('client_portal_accounts')
    .update({ status: 'rejected' })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/portal-accounts')
  return { ok: true }
}
