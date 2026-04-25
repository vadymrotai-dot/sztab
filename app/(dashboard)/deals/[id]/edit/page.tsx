import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { EditDealClient } from './edit-deal-client'

export default async function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: deal }, { data: clients }, { data: products }, { data: people }, { data: suppliers }] =
    await Promise.all([
      supabase.from('deals').select('*').eq('id', id).single(),
      supabase.from('clients').select('id, title').order('title', { ascending: true }),
      supabase.from('products').select('id, name').order('name', { ascending: true }),
      supabase
        .from('people')
        .select('id, name, client_id')
        .order('name', { ascending: true }),
      supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
    ])

  if (!deal) {
    notFound()
  }

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
      <EditDealClient
        deal={deal}
        clients={clients || []}
        products={products || []}
        people={people || []}
        suppliers={suppliers || []}
      />
    </div>
  )
}
