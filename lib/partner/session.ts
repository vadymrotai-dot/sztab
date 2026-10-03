// lib/partner/session.ts — Portal partnera (Credipass, FBA, ...), analog
// lib/portal/session.ts dla klientów. Odczyt service-rolem (partner_accounts
// pod RLS), bo middleware/gate potrzebuje faktu niezależnie od sesji anon.

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type PartnerAccount = {
  id: string
  auth_user_id: string
  partner_id: string
  email: string
  active: boolean
}

export async function getPartnerUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function getPartnerAccount(
  authUserId: string,
): Promise<PartnerAccount | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('partner_accounts')
    .select('id, auth_user_id, partner_id, email, active')
    .eq('auth_user_id', authUserId)
    .eq('active', true)
    .maybeSingle()
  return (data as PartnerAccount | null) ?? null
}

// Czy dany auth-user jest kontem partnera (dowolny, nawet nieaktywny) —
// autorytatywny gate dla admin-layoutów (lag propagacji app_metadata w JWT).
export async function isPartnerUser(authUserId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('partner_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('auth_user_id', authUserId)
  return (count ?? 0) > 0
}
