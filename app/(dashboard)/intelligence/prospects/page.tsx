// app/(dashboard)/intelligence/prospects/page.tsx
// Phase 2.6 / Promt 3: Prospects table page (table-first variant A).
// Reads scored_prospects view (RLS via security_invoker=true on view).

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'

import { ProspectsTable, type ProspectRow } from './_components/prospects-table'

export const dynamic = 'force-dynamic'

export default async function ProspectsPage() {
  const supabase = await createClient()

  // Default ordering: meta DESC, NULLS LAST (unscored prospects на dnie).
  // Limit 100 — UI mode dla 25-100 rekordów; pagination V2 (Phase 4)
  // gdy >500.
  const { data: prospects, error } = await supabase
    .from('scored_prospects')
    .select('*')
    .order('horeca_meta_score', { ascending: false, nullsFirst: false })
    .limit(100)

  if (error) {
    return (
      <div className="flex flex-col">
        <PageHeader
          title="Prospekty"
          breadcrumbs={[
            { label: 'AI Discovery', href: '/intelligence' },
            { label: 'Prospekty' },
          ]}
        />
        <div className="p-6">
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">Błąd ładowania prospektów</p>
            <p className="mt-1 text-xs opacity-80">{error.message}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Prospekty"
        breadcrumbs={[
          { label: 'AI Discovery', href: '/intelligence' },
          { label: 'Prospekty' },
        ]}
      />
      <ProspectsTable initialProspects={(prospects ?? []) as ProspectRow[]} />
    </div>
  )
}
