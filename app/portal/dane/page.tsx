// app/portal/dane/page.tsx — Portal klienta Faza 1: "Moje dane".
// Read: firma (read-only), kontakty (ccm), punkty dostawy (cdp), zgoda RODO.
// Write: WYŁĄCZNIE przez scoped server actions (data-actions.ts). Segment/pricing
// CAŁKOWICIE ukryte. clients read-only (poza toggle marketing_consent).

import { redirect } from 'next/navigation'
import { getPortalUser, getPortalAccount } from '@/lib/portal/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { DaneEditor } from '@/components/portal/dane-editor'

export const dynamic = 'force-dynamic'

export default async function DanePage() {
  const user = await getPortalUser()
  if (!user) redirect('/portal/login')
  const acc = await getPortalAccount(user.id)
  if (!acc || acc.status !== 'approved' || !acc.client_id) redirect('/portal/onboard')

  const admin = createAdminClient()

  // clients — TYLKO whitelist read-only kolumn (nigdy segment/pricing/AI).
  const { data: cli } = await admin
    .from('clients')
    .select('title, nip, city, address, marketing_consent')
    .eq('id', acc.client_id)
    .maybeSingle()

  const { data: contactsData } = await admin
    .from('client_contact_methods')
    .select('id, kind, value, label, is_primary')
    .eq('client_id', acc.client_id)
    .in('kind', ['email', 'phone'])
    .order('is_primary', { ascending: false })

  const { data: pointsData } = await admin
    .from('client_delivery_points')
    .select('id, nazwa, ulica, kod_pocztowy, miasto, odbiorca_imie, odbiorca_telefon, typ_punktu')
    .eq('client_id', acc.client_id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-xl font-bold text-slate-800">Moje dane</h1>
      <DaneEditor
        firma={{
          title: cli?.title ?? '—',
          nip: cli?.nip ?? '',
          city: cli?.city ?? '',
          address: cli?.address ?? '',
        }}
        marketingConsent={cli?.marketing_consent === true}
        contacts={(contactsData ?? []) as any[]}
        points={(pointsData ?? []) as any[]}
      />
    </div>
  )
}
