import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ProductForm } from '@/components/products/product-form'

export default async function NewProductPage() {
  const supabase = await createClient()

  const { data: params } = await supabase
    .from('params')
    .select('*')
    .single()

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Nowy produkt"
        breadcrumbs={[
          { label: 'Produkty', href: '/products' },
          { label: 'Nowy produkt' },
        ]}
      />
      <div className="p-6">
        <ProductForm params={params} />
      </div>
    </div>
  )
}
