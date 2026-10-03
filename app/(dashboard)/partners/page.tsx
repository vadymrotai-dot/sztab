// app/(dashboard)/partners/page.tsx — admin: zarządzanie partnerami portalu
// (Credipass, FBA, ...), kontami logowania i przypisaniem firm.

import { createAdminClient } from '@/lib/supabase/admin'
import { PartnersAdminPanel, type PartnerRow } from '@/components/partner/partners-admin-panel'

export const dynamic = 'force-dynamic'

export default async function PartnersPage() {
  const admin = createAdminClient()

  const { data: partners } = await admin
    .from('partners')
    .select('id, name, slug, notes, active, created_at')
    .order('created_at', { ascending: false })

  const { data: accounts } = await admin
    .from('partner_accounts')
    .select('id, partner_id, email, active, created_at')

  const { data: linkCounts } = await admin
    .from('partner_company_links')
    .select('partner_id')

  const countByPartner = new Map<string, number>()
  for (const l of linkCounts ?? []) {
    const pid = l.partner_id as string
    countByPartner.set(pid, (countByPartner.get(pid) ?? 0) + 1)
  }

  const accountsByPartner = new Map<string, { id: string; email: string; active: boolean }[]>()
  for (const a of (accounts ?? []) as Array<{
    id: string
    partner_id: string
    email: string
    active: boolean
  }>) {
    const arr = accountsByPartner.get(a.partner_id) ?? []
    arr.push({ id: a.id, email: a.email, active: a.active })
    accountsByPartner.set(a.partner_id, arr)
  }

  const rows: PartnerRow[] = ((partners ?? []) as Array<{
    id: string
    name: string
    slug: string
    notes: string | null
    active: boolean
    created_at: string
  }>).map((p) => ({
    ...p,
    companyCount: countByPartner.get(p.id) ?? 0,
    accounts: accountsByPartner.get(p.id) ?? [],
  }))

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-800">Partnerzy (portal zewnętrzny)</h1>
        <p className="text-sm text-slate-500">
          Credipass, FBA i inni — izolowany dostęp do przekazanych firm. Konta
          twórz tylko tutaj, zero self-service.
        </p>
      </div>
      <PartnersAdminPanel partners={rows} />
    </div>
  )
}
