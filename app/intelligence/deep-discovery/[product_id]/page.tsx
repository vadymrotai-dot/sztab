import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { DeepDiscoveryResults } from '@/components/intelligence/deep-discovery-results'
import {
  getDiscoveredEntities,
  getLatestDeepDiscoveryRun,
} from '@/app/actions/intelligence'

// Vercel function timeout dla server actions wywołanych z tej route.
// 800s zgodnie z Pro plan ceiling (recently bumped z 300 na 800).
// Pipeline real-time runs ~3-5 min = 180-300s — 800s daje 2-3x bufor
// jeśli Apify lub KRS rate-limit-ują albo Gemini zacznie streamingować.
// Hobby plan ma limit 60s → na Hobby pipeline ZAWSZE timeout.
export const maxDuration = 800

export default async function DeepDiscoveryPage({
  params,
}: {
  params: Promise<{ product_id: string }>
}) {
  const { product_id } = await params
  const supabase = await createClient()

  const { data: product } = await supabase
    .from('products')
    .select('id, name')
    .eq('id', product_id)
    .single()

  if (!product) notFound()

  const latestRun = await getLatestDeepDiscoveryRun(product_id)
  const entities = latestRun
    ? await getDiscoveredEntities(latestRun.id)
    : []

  const parsed = (latestRun?.parsed_results ?? null) as
    | { warnings?: string[] }
    | null

  return (
    <div className="flex flex-col">
      <PageHeader
        title={`Deep Discovery: ${product.name as string}`}
        breadcrumbs={[
          { label: 'AI Discovery', href: '/intelligence' },
          { label: 'Deep Discovery' },
          { label: product.name as string },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link href={`/products/${product_id}/edit`}>
              <ArrowLeftIcon className="mr-2 size-4" />
              Wróć do produktu
            </Link>
          </Button>
        }
      />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <DeepDiscoveryResults
          productId={product_id}
          productName={product.name as string}
          entities={entities}
          runStatus={latestRun?.status ?? null}
          runWarnings={parsed?.warnings ?? []}
          runDate={latestRun?.completed_at ?? latestRun?.created_at ?? null}
          durationMs={latestRun?.duration_ms ?? null}
        />
      </div>
    </div>
  )
}
