// app/(dashboard)/products/page.tsx
// Sprint O Phase 4 — wrapped existing Katalog у tabs з Dopasowania (TOP-100).

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ProductsContent } from '@/components/products/products-content'
import { NewProductModal } from '@/components/products/new-product-modal'
import { ImportLauncher } from '@/components/products/import-launcher'
import { ProductsTabs } from '@/components/products/products-tabs'
import { MatchesGlobalView } from '@/components/matches/matches-global-view'

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sp = await searchParams
  const tab = sp.tab ?? 'katalog'
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
      supabase.from('products').select('category').not('category', 'is', null),
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
          tab === 'katalog' ? (
            <div className="flex gap-2">
              <ImportLauncher suppliers={suppliers ?? []} />
              <NewProductModal
                suppliers={suppliers ?? []}
                categorySuggestions={categorySuggestions}
              />
            </div>
          ) : null
        }
      />
      <ProductsTabs />
      {tab === 'katalog' && (
        <ProductsContent products={products || []} suppliers={suppliers ?? []} />
      )}
      {tab === 'dopasowania' && (
        <div className="flex flex-1 flex-col gap-4 p-6">
          <MatchesGlobalView />
        </div>
      )}
    </div>
  )
}
