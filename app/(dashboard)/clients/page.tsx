// app/(dashboard)/clients/page.tsx
// Sprint O Phase 5 + Sprint P FIX 1 — Klienci hub з tabs.
// Sprint P: clients table тепер єдиним user-visible store; entity_type
// column distinguishes 'client' vs 'prospect'. CEIDG cache pozostaje
// read-only via dispatcher.

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ClientsHub, type UnifiedRow } from '@/components/clients/clients-hub'
import type { Client } from '@/lib/types'

export default async function ClientsPage() {
  const supabase = await createClient()

  const [{ data: clients }, { data: topMatches }] = await Promise.all([
    supabase.from('clients').select('*').order('title', { ascending: true }),
    supabase
      .from('matches')
      .select('client_id, prospect_id, combined_score')
      .order('combined_score', { ascending: false }),
  ])

  const topByEntity = new Map<string, number>()
  for (const m of (topMatches ?? []) as Array<{
    client_id: string | null
    prospect_id: string | null
    combined_score: number
  }>) {
    const eid = m.client_id ?? m.prospect_id
    if (!eid) continue
    if (!topByEntity.has(eid) || (topByEntity.get(eid) ?? 0) < m.combined_score) {
      topByEntity.set(eid, m.combined_score)
    }
  }

  const clientsList = ((clients ?? []) as Client[]) as Array<
    Client & { entity_type?: 'client' | 'prospect' }
  >

  const unifiedRows: UnifiedRow[] = clientsList.map((c) => ({
    type: (c.entity_type ?? 'client') as 'client' | 'prospect',
    id: c.id,
    name: c.title,
    nip: c.nip ?? null,
    city: c.city ?? null,
    region: c.region ?? null,
    industry: c.industry ?? null,
    status: c.status ?? null,
    has_contact: Boolean(c.phone || c.email || c.website),
    top_match_score: topByEntity.get(c.id) ?? null,
  }))

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Klienci" />
      <ClientsHub clients={clientsList} unifiedRows={unifiedRows} />
    </div>
  )
}
