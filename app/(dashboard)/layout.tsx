import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { CommandBar } from '@/components/command-bar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Hot prospect badge (horeca_meta_score >= 70 AND filter_passed).
  // Fetches via scored_prospects view (security_invoker → RLS applies).
  // Failures degrade to 0 — no badge rather than crash layout.
  let prospectHotCount = 0
  try {
    const { count } = await supabase
      .from('scored_prospects')
      .select('id', { count: 'exact', head: true })
      .gte('horeca_meta_score', 70)
      .eq('filter_passed', true)
    prospectHotCount = count ?? 0
  } catch {
    prospectHotCount = 0
  }

  // Sprint R FIX: removed inner <main className="flex-1 overflow-auto"> wrapper.
  //
  // Issue: Sticky elements у /clients/[id] (action bar + anchor nav)
  // disappeared on scroll because overflow:auto на inner wrapper стваря
  // separate scroll context. Sticky elements у tym kontekście stick
  // relative до wrapper (not viewport) — coupled з flex-column parents
  // produced unreliable behavior across browsers.
  //
  // Fix: SidebarInset jest sam <main> (z @/components/ui/sidebar). Sidebar
  // ma position: fixed (z h-svh), więc nie scrolls з contentem. Zwykły
  // window-scroll przez body — sticky element rendered relative до
  // viewport (jak GitHub README, Notion). Eliminates nested <main> too
  // (invalid HTML).
  return (
    <SidebarProvider>
      <AppSidebar user={user} prospectHotCount={prospectHotCount} />
      <SidebarInset>{children}</SidebarInset>
      <CommandBar />
    </SidebarProvider>
  )
}
