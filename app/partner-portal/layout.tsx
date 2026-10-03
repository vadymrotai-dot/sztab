// app/partner-portal/layout.tsx — Portal partnera. Shell; nazwa partnera w
// headerze pobierana per-request (brak sesji na /login → fallback "Partner").

import { getPartnerUser, getPartnerAccount } from '@/lib/partner/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { PartnerNav } from '@/components/partner/partner-nav'

export const dynamic = 'force-dynamic'

export default async function PartnerPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let partnerName = 'Partner'
  const user = await getPartnerUser()
  if (user) {
    const acc = await getPartnerAccount(user.id)
    if (acc) {
      const admin = createAdminClient()
      const { data: p } = await admin
        .from('partners')
        .select('name')
        .eq('id', acc.partner_id)
        .maybeSingle()
      if (p?.name) partnerName = p.name
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0]">
      <PartnerNav partnerName={partnerName} />
      {children}
    </div>
  )
}
