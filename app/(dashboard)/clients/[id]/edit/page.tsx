import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ClientForm } from '@/components/clients/client-form'

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) {
    notFound()
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Edytuj klienta"
        breadcrumbs={[
          { label: 'Klienci', href: '/clients' },
          { label: client.title, href: `/clients/${id}` },
          { label: 'Edytuj' },
        ]}
      />
      <div className="p-6">
        <ClientForm client={client} />
      </div>
    </div>
  )
}
