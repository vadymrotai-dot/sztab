// app/(dashboard)/staff-accounts/page.tsx — admin: kolejka zatwierdzeń
// pracowników. OSOBNA od /portal-accounts (inny blast radius: zatwierdzenie
// pracownika = pełny dostęp do systemu, nie tylko portal zamówień).

import { createAdminClient } from '@/lib/supabase/admin'
import {
  StaffAccountsTable,
  type StaffAccountRow,
} from '@/components/staff/staff-accounts-table'

export const dynamic = 'force-dynamic'

export default async function StaffAccountsPage() {
  const admin = createAdminClient()
  const { data: accounts } = await admin
    .from('staff_members')
    .select('id, email, name, status, requested_at, approved_at')
    .order('requested_at', { ascending: false })

  const rows = (accounts ?? []) as StaffAccountRow[]
  const pending = rows.filter((r) => r.status === 'pending').length

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-1 text-xl font-bold text-slate-800">Konta pracowników</h1>
      <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        Uwaga: zatwierdzenie pracownika = <b>pełny dostęp do systemu</b> (jak
        Vadym). Zatwierdzaj tylko zaufane osoby.
      </p>
      {pending > 0 && (
        <p className="mb-3 text-sm text-amber-700">
          Oczekujących: <b>{pending}</b>
        </p>
      )}
      <StaffAccountsTable rows={rows} />
    </div>
  )
}
