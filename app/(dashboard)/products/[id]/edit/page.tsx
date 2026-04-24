import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ProductForm } from '@/components/products/product-form'

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (!product) {
    notFound()
  }

  const { data: userParams } = await supabase
    .from('params')
    .select('*')
    .single()

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Edytuj produkt"
        breadcrumbs={[
          { label: 'Produkty', href: '/products' },
          { label: product.name, href: '/products' },
          { label: 'Edytuj' },
        ]}
      />
      <div className="p-6">
        <ProductForm product={product} params={userParams} />
      </div>
    </div>
  )
}
