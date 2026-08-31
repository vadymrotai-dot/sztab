// lib/portal/session.ts — Portal klienta Faza 0.
// Helpers do resolucji konta portalowego. Odczyt service-rolem (admin),
// bo client_portal_accounts pod RLS — a middleware/gate potrzebuje faktu
// niezależnie od sesji anon.

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type PortalAccount = {
  id: string
  auth_user_id: string
  client_id: string | null
  email: string
  status: 'pending' | 'approved' | 'rejected'
  matched_client_id: string | null
}

export async function getPortalUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function getPortalAccount(
  authUserId: string,
): Promise<PortalAccount | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('client_portal_accounts')
    .select('id, auth_user_id, client_id, email, status, matched_client_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  return (data as PortalAccount | null) ?? null
}

// Czy dany auth-user jest portal-userem (dowolny status). Autorytatywny gate
// dla admin-layoutów (na wypadek opóźnienia propagacji app_metadata w JWT).
export async function isPortalUser(authUserId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('client_portal_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('auth_user_id', authUserId)
  return (count ?? 0) > 0
}
