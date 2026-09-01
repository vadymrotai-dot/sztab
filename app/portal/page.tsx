// app/portal/page.tsx — wejście do portalu. Kieruje wg stanu konta.

import { redirect } from 'next/navigation'
import { getPortalUser, getPortalAccount } from '@/lib/portal/session'

export const dynamic = 'force-dynamic'

export default async function PortalIndex() {
  const user = await getPortalUser()
  if (!user) redirect('/portal/login')
  const acc = await getPortalAccount(user.id)
  if (acc?.status === 'approved' && acc.client_id) redirect('/portal/zamowienie')
  redirect('/portal/onboard')
}
