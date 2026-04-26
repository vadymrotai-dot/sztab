import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ClientsTable } from '@/components/clients/clients-table'
import { NewClientModal } from '@/components/clients/new-client-modal'

export default async function ClientsPage() {
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('title', { ascending: true })

  return (
    <div className="flex flex-col">
      <PageHeader title="Klienci" actions={<NewClientModal />} />
      <ClientsTable clients={clients || []} />
    </div>
  )
}
