import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ProductsContent } from '@/components/products/products-content'
import { NewProductModal } from '@/components/products/new-product-modal'
import { ImportLauncher } from '@/components/products/import-launcher'

export default async function ProductsPage() {
  const supabase = await createClient()

  const [{ data: products }, { data: suppliers }, { data: categoryRows }] =
    await Promise.all([
      supabase
        .from('products')
        .select('*')
        .order('lp', { ascending: true, nullsFirst: false }),
      supabase
        .from('suppliers')
        .select('id, name, default_currency')
        .order('name', { ascending: true }),
      supabase
        .from('products')
        .select('category')
        .not('category', 'is', null),
    ])

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
        title="Produkty"
        actions={
          <div className="flex gap-2">
            <ImportLauncher suppliers={suppliers ?? []} />
            <NewProductModal
              suppliers={suppliers ?? []}
              categorySuggestions={categorySuggestions}
            />
          </div>
        }
      />
      <ProductsContent
        products={products || []}
        suppliers={suppliers ?? []}
      />
    </div>
  )
}
