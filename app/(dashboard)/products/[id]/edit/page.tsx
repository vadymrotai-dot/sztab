import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MicroscopeIcon } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ProductForm } from '@/components/products/product-form'
import { FastLookupCard } from '@/components/intelligence/fast-lookup-card'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  getIntelligenceRunsForProduct,
  getLatestDeepDiscoveryRun,
} from '@/app/actions/intelligence'
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
    latestDeepRun,
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
    getLatestDeepDiscoveryRun(id),
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
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MicroscopeIcon className="size-5 text-purple-500" />
                Deep Discovery — pełna lista firm
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Apify scraping (Panorama Firm) + KRS Rejestr.io
                weryfikacja + Gemini ranking. Trwa ~3-5 minut.
              </p>
            </div>
            <Button asChild>
              <Link href={`/intelligence/deep-discovery/${id}`}>
                {latestDeepRun?.status === 'completed' &&
                latestDeepRun.results_count > 0
                  ? `Zobacz wyniki (${latestDeepRun.results_count} firm)`
                  : 'Otwórz Deep Discovery'}
              </Link>
            </Button>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
