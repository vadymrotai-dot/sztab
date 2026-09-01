// app/(dashboard)/portal-accounts/page.tsx — admin: kolejka zatwierdzeń portalu.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  PortalAccountsTable,
  type PortalAccountRow,
} from '@/components/portal/portal-accounts-table'

export const dynamic = 'force-dynamic'

export default async function PortalAccountsPage() {
  const admin = createAdminClient()
  const { data: accounts } = await admin
    .from('client_portal_accounts')
    .select('id, email, nip_submitted, status, matched_client_id, client_id, requested_at')
    .order('requested_at', { ascending: false })

  const accs = (accounts ?? []) as Array<{
    id: string
    email: string
    nip_submitted: string | null
    status: string
    matched_client_id: string | null
    client_id: string | null
    requested_at: string
  }>

  // Dociągnij tytuły dopasowanych klientów.
  const ids = Array.from(
    new Set(accs.map((a) => a.matched_client_id).filter(Boolean) as string[]),
  )
  const titleById = new Map<string, string>()
  if (ids.length > 0) {
    const { data: clis } = await admin
      .from('clients')
      .select('id, title')
      .in('id', ids)
    for (const c of (clis ?? []) as Array<{ id: string; title: string }>) {
      titleById.set(c.id, c.title)
    }
  }

  const rows: PortalAccountRow[] = accs.map((a) => ({
    ...a,
    matched_title: a.matched_client_id
      ? titleById.get(a.matched_client_id) ?? null
      : null,
  }))

  const pending = rows.filter((r) => r.status === 'pending').length

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-800">Konta portalu klienta</h1>
        <p className="text-sm text-slate-500">
          Ręczne zatwierdzanie dostępu. Oczekujących: <b>{pending}</b>.
        </p>
      </div>
      <div className="rounded-lg border border-[#E5E1D8] bg-white p-4">
        <PortalAccountsTable rows={rows} />
      </div>
    </div>
  )
}
