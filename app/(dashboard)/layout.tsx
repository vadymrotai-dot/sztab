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

  return (
    <SidebarProvider>
      <AppSidebar user={user} prospectHotCount={prospectHotCount} />
      <SidebarInset>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
      <CommandBar />
    </SidebarProvider>
  )
}
