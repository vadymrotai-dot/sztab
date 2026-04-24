import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { DealForm } from '@/components/deals/deal-form'

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('id, title')
    .order('title', { ascending: true })

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Nowa umowa"
        breadcrumbs={[
          { label: 'Umowy', href: '/deals' },
          { label: 'Nowa umowa' },
        ]}
      />
      <div className="p-6">
        <DealForm clients={clients || []} defaultClientId={params.client} />
      </div>
    </div>
  )
}
