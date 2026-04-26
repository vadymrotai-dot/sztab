import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ProductForm } from '@/components/products/product-form'
import { FastLookupCard } from '@/components/intelligence/fast-lookup-card'
import { getIntelligenceRunsForProduct } from '@/app/actions/intelligence'
import { settingsRowsToPricing } from '@/lib/pricing'
import type { FastLookupResult } from '@/lib/ai/intelligence'

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
    intelligenceRuns,
  ] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase
      .from('suppliers')
      .select('id, name, default_currency')
      .order('name', { ascending: true }),
    supabase.from('settings').select('key, value'),
    supabase
      .from('products')
      .select('category')
      .not('category', 'is', null),
    getIntelligenceRunsForProduct(id),
  ])

  if (!product) notFound()

  // Pierwszy completed run z parsed_results — pokaż wyniki natychmiast
  // bez czekania na ponowny click. Failed/running runy pomijamy.
  const latestCompleted = intelligenceRuns.find(
    (r) => r.status === 'completed' && r.parsed_results,
  )
  const initialResult =
    (latestCompleted?.parsed_results as FastLookupResult | null) ?? null
  const initialRunDate =
    latestCompleted?.completed_at ?? latestCompleted?.created_at ?? null

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
      <div className="max-w-3xl space-y-6 p-6">
        <ProductForm
          product={product}
          suppliers={suppliers ?? []}
          pricing={pricing}
          categorySuggestions={categorySuggestions}
        />
        <FastLookupCard
          productId={id}
          initialResult={initialResult}
          initialRunDate={initialRunDate}
        />
      </div>
    </div>
  )
}
