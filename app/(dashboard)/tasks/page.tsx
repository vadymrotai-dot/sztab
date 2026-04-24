import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { TasksContent } from '@/components/tasks/tasks-content'
import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'

export default async function TasksPage() {
  const supabase = await createClient()

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, client:clients(id, title), goal:goals(id, title)')
    .order('due', { ascending: true, nullsFirst: false })

  const { data: clients } = await supabase
    .from('clients')
    .select('id, title')
    .order('title', { ascending: true })

  const { data: goals } = await supabase
    .from('goals')
    .select('id, title')
    .order('title', { ascending: true })

  return (
    <div className="flex flex-col">
      <PageHeader title="Zadania" />
      <TasksContent tasks={tasks || []} clients={clients || []} goals={goals || []} />
    </div>
  )
}
