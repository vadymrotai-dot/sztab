// app/zamowienie/layout.tsx
// Sprint S-ORDER.1.B.2 (19.05.2026) — public order form layout.
// NO supabase.auth.getUser() — route is publicly accessible via access_token UUID.
// Wraps page у simple slate background for customer-facing branding.

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Zamówienie hurtowe · DAGOLD',
  description: 'Złóż zamówienie hurtowe DAGOLD',
}

export default function ZamowienieLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-100 py-4 sm:py-8">{children}</div>
  )
}
