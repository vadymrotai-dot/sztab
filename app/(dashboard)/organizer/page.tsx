// app/(dashboard)/organizer/page.tsx
// Sprint O Phase 3 — wrapper з 4 tabs (Zadania/Cele/Nawyki/Kalkulator).
// Sprint S4 Phase 4B — primary "+ Nowe zadanie" header button +
// hot leady do empty state у Zadania tab.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'
import { TasksContent } from '@/components/tasks/tasks-content'
import { GoalsContent } from '@/components/goals/goals-content'
import { HabitsContent } from '@/components/habits/habits-content'
import { CalculatorContent } from '@/components/calculator/calculator-content'
import { OrganizerTabs } from '@/components/organizer/organizer-tabs'
import type { HotLead } from '@/components/dzis/hot-leady-chips'

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
      <PageHeader
        title="Organizer"
        actions={
          tab === 'zadania' ? (
            <Button size="sm" asChild>
              <Link href="/organizer?tab=zadania&new=1">
                <PlusIcon className="mr-1.5 size-3.5" />
                Nowe zadanie
              </Link>
            </Button>
          ) : null
        }
      />
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
  const [
    { data: tasks },
    { data: clients },
    { data: goals },
    { data: topMatches },
    { data: clientsWithProfile },
  ] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, client:clients(id, title), goal:goals(id, title)')
      .order('due', { ascending: true, nullsFirst: false }),
    supabase.from('clients').select('id, title').order('title', { ascending: true }),
    supabase.from('goals').select('id, title').order('title', { ascending: true }),
    supabase
      .from('matches')
      .select('client_id, combined_score')
      .gte('combined_score', 80)
      .order('combined_score', { ascending: false })
      .limit(50),
    supabase
      .from('clients')
      .select('id, title, business_profile')
      .not('business_profile', 'is', null)
      .limit(500),
  ])

  const profileIds = new Set(
    ((clientsWithProfile ?? []) as Array<{ id: string }>).map((c) => c.id),
  )
  const titleById = new Map<string, string>()
  for (const c of (clientsWithProfile ?? []) as Array<{ id: string; title: string }>) {
    titleById.set(c.id, c.title)
  }
  const seen = new Set<string>()
  const hotLeads: HotLead[] = []
  for (const m of (topMatches ?? []) as Array<{
    client_id: string | null
    combined_score: number
  }>) {
    if (!m.client_id || seen.has(m.client_id) || !profileIds.has(m.client_id)) continue
    const name = titleById.get(m.client_id)
    if (!name) continue
    seen.add(m.client_id)
    hotLeads.push({ id: m.client_id, name, score: m.combined_score })
    if (hotLeads.length >= 5) break
  }

  return (
    <TasksContent
      tasks={tasks || []}
      clients={clients || []}
      goals={goals || []}
      hotLeads={hotLeads}
    />
  )
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
