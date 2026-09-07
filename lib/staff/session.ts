// lib/staff/session.ts — Faza staff-access + samorejestracja.
// Helpers do rozpoznania pracownika. Odczyt service-rolem (staff_members pod
// RLS), bo gate potrzebuje faktu niezależnie od sesji. is_staff_member() w SQL
// i isStaffMember() tutaj muszą zwracać to samo (status='approved').

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { WORKSPACE_OWNER_ID } from '@/lib/staff/owner'

export type StaffStatus = 'pending' | 'approved' | 'rejected'

export type StaffAccount = {
  id: string
  auth_user_id: string
  email: string
  name: string | null
  status: StaffStatus
}

export async function getStaffUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

// Konto pracownika (dowolny status) albo null. Autorytatywny odczyt DB.
export async function getStaffAccount(
  authUserId: string,
): Promise<StaffAccount | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('staff_members')
    .select('id, auth_user_id, email, name, status')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  return (data as StaffAccount | null) ?? null
}

// Czy dany auth-user jest ZATWIERDZONYM pracownikiem (status='approved').
// Mirror is_staff_member() w SQL. Autorytatywny gate (na wypadek lagu JWT).
export async function isStaffMember(authUserId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('staff_members')
    .select('id', { count: 'exact', head: true })
    .eq('auth_user_id', authUserId)
    .eq('status', 'approved')
  return (count ?? 0) > 0
}

// Bramka admina (DB-authoritative, backup dla middleware + gasi lag JWT):
// właściciel (Vadym) LUB zatwierdzony pracownik. Używane w layoutach admina.
export async function hasAdminAccess(authUserId: string): Promise<boolean> {
  if (authUserId === WORKSPACE_OWNER_ID) return true
  return isStaffMember(authUserId)
}
