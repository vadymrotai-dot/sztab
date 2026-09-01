// app/portal/layout.tsx — Portal klienta. Shell + nawigacja sekcji (Faza 1).
// PortalNav sam ukrywa się na /portal/login i /portal/onboard.

import { PortalNav } from '@/components/portal/portal-nav'

export const dynamic = 'force-dynamic'

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <PortalNav />
      {children}
    </div>
  )
}
