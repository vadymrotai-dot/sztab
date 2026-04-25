import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { SuppliersTable } from './suppliers-table'
import { NewSupplierModal } from './new-supplier-modal'

export default async function SuppliersPage() {
  const supabase = await createClient()

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('*')
    .order('name', { ascending: true })

  return (
    <div className="flex flex-col">
      <PageHeader title="Dostawcy" actions={<NewSupplierModal />} />
      <div className="p-6">
        <SuppliersTable suppliers={suppliers ?? []} />
      </div>
    </div>
  )
}
