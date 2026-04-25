import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { DashboardContent } from '@/components/dashboard/dashboard-content'
import { CLOSED_DEAL_STAGES } from '@/lib/types'

const closedFilter = `("${CLOSED_DEAL_STAGES.join('","')}")`

const dealSelect =
  '*, client:clients(id, title), product:products(id, name)'

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

const startOfWeekMonday = (d: Date) => {
  const day = d.getDay()
  const offsetToMonday = day === 0 ? -6 : 1 - day
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetToMonday)
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  const today = isoDate(now)
  const sevenDaysFromNow = isoDate(new Date(Date.now() + 7 * 86_400_000))
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const startOfMonth = isoDate(new Date(now.getFullYear(), now.getMonth(), 1))

  const weekStart = startOfWeekMonday(now)
  const weekDays: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return isoDate(d)
  })

  const [
    callToday,
    openDeals,
    wonThisMonth,
    lostThisMonth,
    noNextAction,
    stale,
    stuckNegotiation,
    closingSoon,
    tasksToday,
    habits,
  ] = await Promise.all([
    supabase
      .from('deals')
      .select(dealSelect)
      .lte('next_action_date', today)
      .not('next_action_date', 'is', null)
      .not('stage', 'in', closedFilter)
      .order('next_action_date', { ascending: true }),
    supabase
      .from('deals')
      .select('id, total_value, amount, margin_amount')
      .not('stage', 'in', closedFilter),
    supabase
      .from('deals')
      .select('id, total_value, amount, margin_amount')
      .eq('stage', 'wygrana')
      .gte('updated_at', startOfMonth),
    supabase
      .from('deals')
      .select('id, total_value, amount')
      .eq('stage', 'przegrana')
      .gte('updated_at', startOfMonth),
    supabase
      .from('deals')
      .select(dealSelect)
      .is('next_action_date', null)
      .not('stage', 'in', closedFilter)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('deals')
      .select(dealSelect)
      .lt('updated_at', fourteenDaysAgo)
      .not('next_action_date', 'is', null)
      .not('stage', 'in', closedFilter)
      .order('updated_at', { ascending: true })
      .limit(20),
    supabase
      .from('deals')
      .select(dealSelect)
      .eq('stage', 'negocjacje')
      .lt('updated_at', thirtyDaysAgo)
      .order('updated_at', { ascending: true }),
    supabase
      .from('deals')
      .select(dealSelect)
      .gte('expected_close_date', today)
      .lte('expected_close_date', sevenDaysFromNow)
      .not('stage', 'in', closedFilter)
      .order('expected_close_date', { ascending: true }),
    supabase
      .from('tasks')
      .select('*, client:clients(id, title), goal:goals(id, title)')
      .eq('done', false)
      .lte('due', today)
      .not('due', 'is', null)
      .order('due', { ascending: true })
      .limit(11),
    supabase
      .from('habits')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(5),
  ])

  return (
    <div className="flex flex-col">
      <PageHeader title="Dzis" />
      <DashboardContent
        today={today}
        weekDays={weekDays}
        callToday={callToday.data || []}
        openDeals={openDeals.data || []}
        wonThisMonth={wonThisMonth.data || []}
        lostThisMonth={lostThisMonth.data || []}
        noNextAction={noNextAction.data || []}
        stale={stale.data || []}
        stuckNegotiation={stuckNegotiation.data || []}
        closingSoon={closingSoon.data || []}
        tasksToday={tasksToday.data || []}
        habits={habits.data || []}
      />
    </div>
  )
}
