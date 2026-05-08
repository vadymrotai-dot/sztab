import Link from 'next/link'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { listIntelligenceRuns } from '@/app/actions/intelligence'
import { IntelligenceDashboardClient } from '@/components/intelligence/intelligence-dashboard-client'

const TARGET_TYPES = ['product', 'category', 'supplier', 'client'] as const
type TargetType = (typeof TARGET_TYPES)[number]

const filterLabels: Record<'all' | TargetType, string> = {
  all: 'Wszystkie',
  product: 'Produkty',
  category: 'Kategorie',
  supplier: 'Dostawcy',
  client: 'Klienci',
}

export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const sp = await searchParams
  const filter = TARGET_TYPES.includes(sp.type as TargetType)
    ? (sp.type as TargetType)
    : null

  const runs = await listIntelligenceRuns(
    filter ? { target_type: filter } : undefined,
  )

  return (
    <div className="flex flex-col">
      <PageHeader
        title="AI Discovery"
        breadcrumbs={[{ label: 'AI Discovery' }]}
      />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtr:</span>
          <Button
            variant={filter == null ? 'default' : 'outline'}
            size="sm"
            asChild
          >
            <Link href="/intelligence">{filterLabels.all}</Link>
          </Button>
          {TARGET_TYPES.map((t) => (
            <Button
              key={t}
              variant={filter === t ? 'default' : 'outline'}
              size="sm"
              asChild
            >
              <Link href={`/intelligence?type=${t}`}>{filterLabels[t]}</Link>
            </Button>
          ))}
        </div>
        <IntelligenceDashboardClient runs={runs} />
      </div>
    </div>
  )
}
