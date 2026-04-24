import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { HabitsContent } from '@/components/habits/habits-content'

export default async function HabitsPage() {
  const supabase = await createClient()

  const { data: habits } = await supabase
    .from('habits')
    .select('*')
    .order('created_at', { ascending: true })

  return (
    <div className="flex flex-col">
      <PageHeader title="Nawyki" />
      <HabitsContent habits={habits || []} />
    </div>
  )
}
