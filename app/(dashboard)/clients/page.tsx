// app/(dashboard)/clients/page.tsx
// Sprint O Phase 5 — Klienci hub з tabs (Klienci/Prospекti/Wszystko),
// chip filters, bulk select, "Akcje grupowe" + "+Dodaj firmę" CTA.

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import {
  ClientsHub,
  type ProspectRow,
  type UnifiedRow,
} from '@/components/clients/clients-hub'
import type { Client } from '@/lib/types'

export default async function ClientsPage() {
  const supabase = await createClient()

  const [{ data: clients }, { data: prospects }, { data: topMatches }] = await Promise.all([
    supabase.from('clients').select('*').order('title', { ascending: true }),
    supabase
      .from('ceidg_prospects')
      .select('id, name, nip, miejscowosc, wojewodztwo, pkd_main, status, vat_status, telefon, email, www')
      .order('name', { ascending: true }),
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

  const clientsList = (clients ?? []) as Client[]
  const prospectsList = ((prospects ?? []) as unknown) as Array<
    ProspectRow & { telefon: string | null; email: string | null; www: string | null }
  >

  const unifiedRows: UnifiedRow[] = [
    ...clientsList.map((c) => ({
      type: 'client' as const,
      id: c.id,
      name: c.title,
      nip: c.nip ?? null,
      city: c.city ?? null,
      region: c.region ?? null,
      industry: c.industry ?? null,
      status: c.status ?? null,
      has_contact: Boolean(c.phone || c.email || c.website),
      top_match_score: topByEntity.get(c.id) ?? null,
    })),
    ...prospectsList.map((p) => ({
      type: 'prospect' as const,
      id: p.id,
      name: p.name,
      nip: p.nip,
      city: p.miejscowosc,
      region: p.wojewodztwo,
      industry: p.pkd_main,
      status: p.status,
      has_contact: Boolean(p.telefon || p.email || p.www),
      top_match_score: topByEntity.get(p.id) ?? null,
    })),
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Klienci" />
      <ClientsHub clients={clientsList} prospects={prospectsList} unifiedRows={unifiedRows} />
    </div>
  )
}
