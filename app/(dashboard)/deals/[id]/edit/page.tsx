import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { DealForm } from '@/components/deals/deal-form'

export default async function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: deal } = await supabase
    .from('deals')
    .select('*')
    .eq('id', id)
    .single()

  if (!deal) {
    notFound()
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('id, title')
    .order('title', { ascending: true })

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Edytuj umowe"
        breadcrumbs={[
          { label: 'Umowy', href: '/deals' },
          { label: deal.title, href: `/deals/${id}` },
          { label: 'Edytuj' },
        ]}
      />
      <div className="p-6">
        <DealForm deal={deal} clients={clients || []} />
      </div>
    </div>
  )
}
