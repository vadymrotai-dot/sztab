import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { EditSupplierForm } from './edit-supplier-form'
import { DeleteButton } from '../delete-button'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditSupplierPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: supplier } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .single()

  if (!supplier) {
    notFound()
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title={`Edycja: ${supplier.name}`}
        breadcrumbs={[
          { label: 'Dostawcy', href: '/suppliers' },
          { label: supplier.name },
        ]}
        actions={<DeleteButton id={supplier.id} name={supplier.name} />}
      />
      <div className="max-w-3xl p-6">
        <EditSupplierForm supplier={supplier} />
      </div>
    </div>
  )
}
