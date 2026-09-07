import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasAdminAccess } from '@/lib/staff/session'
import { FbaSidebar } from '@/components/fba/sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'

export default async function FbaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  // DB-authoritative gate: tylko właściciel lub zatwierdzony pracownik.
  if (!(await hasAdminAccess(user.id))) redirect('/staff/onboard')
  return (
    <SidebarProvider>
      <FbaSidebar user={user} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
