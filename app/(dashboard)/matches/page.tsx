// app/(dashboard)/matches/page.tsx
// Sprint F — Global TOP-100 matches dashboard.
// Pre-Pikniko handoff view. Filterable z target_type / min_score.

import { PageHeader } from '@/components/page-header'
import { MatchesGlobalView } from '@/components/matches/matches-global-view'

export const dynamic = 'force-dynamic'

export default function MatchesPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Dopasowania (TOP-100)"
        breadcrumbs={[{ label: 'Dopasowania' }]}
      />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <MatchesGlobalView />
      </div>
    </div>
  )
}
