// app/portal/layout.tsx — Portal klienta Faza 0. Minimalny shell.
// Auth-guard per strona (login jest publiczny). Tu tylko wrapper wizualny.

export const dynamic = 'force-dynamic'

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="min-h-screen bg-[#FAFAF7]">{children}</div>
}
