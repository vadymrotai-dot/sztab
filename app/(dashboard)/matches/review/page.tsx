// app/(dashboard)/matches/review/page.tsx
// Sprint I — Pre-Apify review queue (Layer 2: manual review).

import { PageHeader } from '@/components/page-header'
import { ReviewQueueView } from '@/components/matches/review-queue-view'

export const dynamic = 'force-dynamic'

export default function ReviewQueuePage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Pre-Apify review queue"
        breadcrumbs={[
          { label: 'Matche', href: '/matches' },
          { label: 'Review queue' },
        ]}
      />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <ReviewQueueView />
      </div>
    </div>
  )
}
