// app/intelligence/layout.tsx
// Phase 1 Krok 2/5 — (intelligence) workspace layout.
// Mirror app/operacje/layout.tsx pattern (RSC + auth check + Sidebar shell),
// без counts queries (Phase 2 wires real prospects/analyses/matches counts).
//
// Sprint R FIX preserve: SidebarInset IS the <main>. NO inner <main>
// wrapper — sticky elements rely на window-scroll context.
//
// Architectural note (Phase 1 temp до Krok 4):
//   - /intelligence/pulpit → app/intelligence/pulpit/page.tsx (NEW intelligence layout)
//   - /intelligence (root) → app/(dashboard)/intelligence/page.tsx (DASHBOARD layout)
//   - /intelligence/lookup, /intelligence/prospects → DASHBOARD layout
//   - /intelligence/discovery|dopasowania|analizy → 404 до Krok 4 page creation
//   Krok 4 буде move existing /intelligence/* dashboard pages до new
//   app/intelligence/* tree, finalizуючи intelligence layout coverage.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntelligenceSidebar } from '@/components/intelligence/sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'

export default async function IntelligenceLayout({
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

  return (
    <SidebarProvider>
      <IntelligenceSidebar user={user} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
