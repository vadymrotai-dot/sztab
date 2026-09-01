// app/portal/page.tsx — Portal klienta, struktura A: Pulpit (hub startowy).
// approved → dashboard; pending/rejected → onboard; brak sesji → login.

import { redirect } from 'next/navigation'
import { getPortalUser, getPortalAccount } from '@/lib/portal/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { PulpitDashboard } from '@/components/portal/pulpit-dashboard'

export const dynamic = 'force-dynamic'

export default async function PortalIndex() {
  const user = await getPortalUser()
  if (!user) redirect('/portal/login')
  const acc = await getPortalAccount(user.id)
  if (!acc || acc.status !== 'approved' || !acc.client_id) redirect('/portal/onboard')

  const admin = createAdminClient()

  const [{ data: cli }, { data: ordersData }, { data: draftRow }] = await Promise.all([
    admin.from('clients').select('title').eq('id', acc.client_id).maybeSingle(),
    admin
      .from('orders')
      .select('id, order_number, status, total_brutto, submitted_at, created_at')
      .eq('client_id', acc.client_id)
      .neq('status', 'draft')
      .order('submitted_at', { ascending: false, nullsFirst: false }),
    // Niedokończony koszyk — draft z zapisanymi pozycjami.
    admin
      .from('orders')
      .select('draft_cart')
      .eq('client_id', acc.client_id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const dc = (draftRow?.draft_cart ?? null) as { pozycje?: unknown[] } | null
  const hasUnfinishedDraft = Array.isArray(dc?.pozycje) && dc!.pozycje!.length > 0

  const orders = (ordersData ?? []) as Array<{
    id: string
    order_number: string
    status: string
    total_brutto: number | null
    submitted_at: string | null
    created_at: string
  }>

  const inRealization = orders.filter(
    (o) => o.status === 'submitted' || o.status === 'confirmed',
  ).length
  const last = orders[0] ?? null

  return (
    <PulpitDashboard
      firma={cli?.title ?? 'Kliencie'}
      hasUnfinishedDraft={hasUnfinishedDraft}
      inRealization={inRealization}
      totalCount={orders.length}
      last={
        last
          ? {
              id: last.id,
              total_brutto: last.total_brutto,
              date: last.submitted_at ?? last.created_at,
            }
          : null
      }
      recent={orders.slice(0, 5)}
    />
  )
}
