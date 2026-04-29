// app/(dashboard)/organizer/page.tsx
// Sprint O Phase 3 — wrapper з 4 tabs (Zadania/Cele/Nawyki/Kalkulator).

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { TasksContent } from '@/components/tasks/tasks-content'
import { GoalsContent } from '@/components/goals/goals-content'
import { HabitsContent } from '@/components/habits/habits-content'
import { CalculatorContent } from '@/components/calculator/calculator-content'
import { OrganizerTabs } from '@/components/organizer/organizer-tabs'

export default async function OrganizerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sp = await searchParams
  const tab = sp.tab ?? 'zadania'
  const supabase = await createClient()

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Organizer" />
      <OrganizerTabs />
      <div className="flex-1 overflow-auto">
        {tab === 'zadania' && <ZadaniaContent supabase={supabase} />}
        {tab === 'cele' && <CeleContent supabase={supabase} />}
        {tab === 'nawyki' && <NawykiContent supabase={supabase} />}
        {tab === 'kalkulator' && <KalkulatorContent supabase={supabase} />}
      </div>
    </div>
  )
}

async function ZadaniaContent({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  const [{ data: tasks }, { data: clients }, { data: goals }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, client:clients(id, title), goal:goals(id, title)')
      .order('due', { ascending: true, nullsFirst: false }),
    supabase.from('clients').select('id, title').order('title', { ascending: true }),
    supabase.from('goals').select('id, title').order('title', { ascending: true }),
  ])
  return <TasksContent tasks={tasks || []} clients={clients || []} goals={goals || []} />
}

async function CeleContent({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false })
  return <GoalsContent goals={goals || []} />
}

async function NawykiContent({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  const { data: habits } = await supabase
    .from('habits')
    .select('*')
    .order('created_at', { ascending: true })
  return <HabitsContent habits={habits || []} />
}

async function KalkulatorContent({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  const { data: params } = await supabase.from('params').select('*').single()
  return <CalculatorContent params={params} />
}
