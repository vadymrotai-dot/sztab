import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { DashboardContent } from '@/components/dashboard/dashboard-content'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // Fetch today's tasks
  const today = new Date().toISOString().split('T')[0]
  const { data: todayTasks } = await supabase
    .from('tasks')
    .select('*, client:clients(id, title)')
    .eq('due', today)
    .eq('done', false)
    .order('priority', { ascending: false })

  // Fetch overdue tasks
  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('*, client:clients(id, title)')
    .lt('due', today)
    .eq('done', false)
    .order('due', { ascending: true })

  // Fetch recent deals
  const { data: recentDeals } = await supabase
    .from('deals')
    .select('*, client:clients(id, title)')
    .not('stage', 'in', '("wygrana","przegrana")')
    .order('updated_at', { ascending: false })
    .limit(5)

  // Fetch habits with today's log
  const { data: habits } = await supabase
    .from('habits')
    .select('*')
    .order('created_at', { ascending: true })

  // Fetch stats
  const { count: totalClients } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })

  const { count: activeDeals } = await supabase
    .from('deals')
    .select('*', { count: 'exact', head: true })
    .not('stage', 'in', '("wygrana","przegrana")')

  const { data: wonDealsData } = await supabase
    .from('deals')
    .select('amount')
    .eq('stage', 'wygrana')

  const wonDealsValue = wonDealsData?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0

  const { count: completedTasksThisMonth } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('done', true)
    .gte('completed_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])

  return (
    <div className="flex flex-col">
      <PageHeader title="Dzis" />
      <DashboardContent
        todayTasks={todayTasks || []}
        overdueTasks={overdueTasks || []}
        recentDeals={recentDeals || []}
        habits={habits || []}
        stats={{
          totalClients: totalClients || 0,
          activeDeals: activeDeals || 0,
          wonDealsValue,
          completedTasksThisMonth: completedTasksThisMonth || 0,
        }}
      />
    </div>
  )
}
