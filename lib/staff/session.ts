// lib/staff/session.ts — Faza 1 staff-access.
// Helper do rozpoznania, czy zalogowany auth-user jest pracownikiem (staff).
// Wzór 1:1 z lib/portal/session.ts::isPortalUser — odczyt service-rolem, bo
// staff_members jest pod RLS, a gate potrzebuje faktu niezależnie od sesji.
//
// Model Fazy 1: Vadym NIE jest w staff_members (widzi dane przez własne
// owner-polityki). staff_members zawiera tylko pracowników. is_staff_member()
// w SQL i isStaffMember() tutaj muszą zwracać to samo.

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

// Czy dany auth-user jest aktywnym pracownikiem (staff_members.active = true).
export async function isStaffMember(authUserId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('staff_members')
    .select('id', { count: 'exact', head: true })
    .eq('auth_user_id', authUserId)
    .eq('active', true)
  return (count ?? 0) > 0
}
