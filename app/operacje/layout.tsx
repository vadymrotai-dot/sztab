// app/(operacje)/layout.tsx
// Phase 1 Krok 1/5 — (operacje) workspace layout.
// Mirror app/(dashboard)/layout.tsx pattern (RSC + auth check + Sidebar
// shell), але без counts queries (Phase 2 wires real Zamówienia/Faktury/
// Wysyłki tables) і без CommandBar (scope to dashboard для зараз).
//
// Sprint R FIX preserve: SidebarInset IS the <main>. NO inner <main>
// wrapper — sticky elements rely на window-scroll context.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPortalUser } from '@/lib/portal/session'
import { OperacjeSidebar } from '@/components/operacje/sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'

export default async function OperacjeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Portal klienta Faza 0 (E) — portal-user nie wchodzi do operacji admina.
  if (await isPortalUser(user.id)) {
    redirect('/portal')
  }

  // Phase 1 — empty counts (placeholder workspace). Phase 2 wire-up:
  //   counts={ zamowienia: pending, faktury: unpaid, wysylki: pending }
  // через паралельні Supabase queries (mirror dashboard pattern).
  return (
    <SidebarProvider>
      <OperacjeSidebar user={user} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
