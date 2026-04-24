import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { GoalsContent } from '@/components/goals/goals-content'

export default async function GoalsPage() {
  const supabase = await createClient()

  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false })

  return (
    <div className="flex flex-col">
      <PageHeader title="Cele" />
      <GoalsContent goals={goals || []} />
    </div>
  )
}
