import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FbaSidebar } from '@/components/fba/sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'

export default async function FbaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return (
    <SidebarProvider>
      <FbaSidebar user={user} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
