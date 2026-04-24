import { PageHeader } from '@/components/page-header'
import { ClientForm } from '@/components/clients/client-form'

export default function NewClientPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Nowy klient"
        breadcrumbs={[
          { label: 'Klienci', href: '/clients' },
          { label: 'Nowy klient' },
        ]}
      />
      <div className="p-6">
        <ClientForm />
      </div>
    </div>
  )
}
