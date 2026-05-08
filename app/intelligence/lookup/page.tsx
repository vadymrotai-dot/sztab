// app/intelligence/lookup/page.tsx
// Sprint K / Phase 3 — intelligence lookup form.
// Phase 1 Krok 4 (08.05.2026) — moved з app/(dashboard)/intelligence/lookup/.

import { PageHeader } from '@/components/page-header'
import { LookupForm } from '@/components/intelligence/lookup-form'

export const dynamic = 'force-dynamic'

export default function IntelligenceLookupPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Intelligence Lookup"
        breadcrumbs={[{ label: 'Intelligence', href: '/intelligence' }, { label: 'Lookup' }]}
      />
      <div className="flex flex-1 flex-col gap-4 p-6 max-w-3xl">
        <LookupForm />
      </div>
    </div>
  )
}
