import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ProductForm } from '@/components/products/product-form'
import { settingsRowsToPricing } from '@/lib/pricing'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: product },
    { data: suppliers },
    { data: settingsRows },
    { data: categoryRows },
  ] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase
      .from('suppliers')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase.from('settings').select('key, value'),
    supabase
      .from('products')
      .select('category')
      .not('category', 'is', null),
  ])

  if (!product) notFound()

  const pricing = settingsRowsToPricing(settingsRows)
  const categorySuggestions = Array.from(
    new Set(
      (categoryRows ?? [])
        .map((r) => (r.category as string | null)?.trim())
        .filter((c): c is string => Boolean(c)),
    ),
  ).sort()

  return (
    <div className="flex flex-col">
      <PageHeader
        title={`Edycja: ${product.name}`}
        breadcrumbs={[
          { label: 'Produkty', href: '/products' },
          { label: product.name },
        ]}
      />
      <div className="max-w-3xl p-6">
        <ProductForm
          product={product}
          suppliers={suppliers ?? []}
          pricing={pricing}
          categorySuggestions={categorySuggestions}
        />
      </div>
    </div>
  )
}
