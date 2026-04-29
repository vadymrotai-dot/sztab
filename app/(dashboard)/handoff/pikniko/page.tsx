// app/(dashboard)/handoff/pikniko/page.tsx
// Sprint N Phase C2 — Pikniko handoff page для cohort review + export.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ColdOpenerCell } from '@/components/handoff/cold-opener-cell'
import { ExportButtons } from '@/components/handoff/export-buttons'
import { CohortFilters } from '@/components/handoff/cohort-filters'
import { PhoneIcon, MailIcon, GlobeIcon, UsersIcon } from 'lucide-react'

interface CohortRow {
  rank: number
  entity_id: string
  entity_type: 'client' | 'prospect'
  name: string
  nip: string
  legal_form: string | null
  region: string | null
  city: string | null
  top_product: string | null
  family_name: string | null
  combined_score: number | null
  buyer_strength: number | null
  phone: string | null
  email: string | null
  website: string | null
  decision_maker: string | null
  decision_maker_role: string | null
  cold_opener: string | null
}

const FAMILIES = ['Kiszonki', 'Sałatki gotowe', 'Marynaty', 'Buraki / Warzywa konserwowane']

async function fetchCohortRows(): Promise<{ cohort_name: string; created_at: string; rows: CohortRow[] } | null> {
  const supabase = await createClient()

  const { data: cohort } = await supabase
    .from('pikniko_handoff_cohorts')
    .select('cohort_name, created_at, entity_ids, metadata')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!cohort) return null
  const c = cohort as {
    cohort_name: string
    created_at: string
    entity_ids: Array<{ id: string; type: 'client' | 'prospect'; rank: number }>
    metadata: unknown
  }
  if (!Array.isArray(c.entity_ids) || c.entity_ids.length === 0) {
    return { cohort_name: c.cohort_name, created_at: c.created_at, rows: [] }
  }

  const clientIds = c.entity_ids.filter((e) => e.type === 'client').map((e) => e.id)
  const prospectIds = c.entity_ids.filter((e) => e.type === 'prospect').map((e) => e.id)

  // Bulk fetch entities
  const [clientsRes, prospectsRes] = await Promise.all([
    clientIds.length > 0
      ? supabase
          .from('clients')
          .select('id, title, nip, krs_legal_form, region, city, business_profile, phone, email, website')
          .in('id', clientIds)
      : Promise.resolve({ data: [] }),
    prospectIds.length > 0
      ? supabase
          .from('ceidg_prospects')
          .select('id, name, nip, krs_legal_form, wojewodztwo, miejscowosc, telefon, email, www')
          .in('id', prospectIds)
      : Promise.resolve({ data: [] }),
  ])
  const clientsMap = new Map(
    (clientsRes.data ?? []).map((c) => [(c as { id: string }).id, c as Record<string, unknown>]),
  )
  const prospectsMap = new Map(
    (prospectsRes.data ?? []).map((p) => [(p as { id: string }).id, p as Record<string, unknown>]),
  )

  // Top match per entity
  const allIds = c.entity_ids.map((e) => e.id)
  const { data: matches } = await supabase
    .from('matches')
    .select('client_id, prospect_id, combined_score, product_id, products(name, family_id, taxonomy_families(name_pl))')
    .or(`client_id.in.(${clientIds.join(',') || '00000000-0000-0000-0000-000000000000'}),prospect_id.in.(${prospectIds.join(',') || '00000000-0000-0000-0000-000000000000'})`)
    .order('combined_score', { ascending: false })

  const topMatchByEntity = new Map<string, { product: string; family: string; score: number }>()
  type MatchRow = {
    client_id: string | null
    prospect_id: string | null
    combined_score: number
    products:
      | { name: string; taxonomy_families: { name_pl: string } | { name_pl: string }[] | null }
      | { name: string; taxonomy_families: { name_pl: string } | { name_pl: string }[] | null }[]
      | null
  }
  for (const m of ((matches ?? []) as unknown) as MatchRow[]) {
    const eid = m.client_id ?? m.prospect_id
    if (!eid || topMatchByEntity.has(eid)) continue
    const prod = Array.isArray(m.products) ? m.products[0] : m.products
    if (!prod) continue
    const tf = prod.taxonomy_families
    const fam = Array.isArray(tf) ? tf[0]?.name_pl : tf?.name_pl
    topMatchByEntity.set(eid, {
      product: prod.name,
      family: fam ?? '?',
      score: m.combined_score,
    })
  }

  // Decision makers
  const { data: links } = await supabase
    .from('person_company_links')
    .select('client_id, prospect_id, rola, jest_decyzyjny, persons(imie, nazwisko)')
    .or(`client_id.in.(${clientIds.join(',') || '00000000-0000-0000-0000-000000000000'}),prospect_id.in.(${prospectIds.join(',') || '00000000-0000-0000-0000-000000000000'})`)
    .order('jest_decyzyjny', { ascending: false })

  const dmByEntity = new Map<string, { name: string; role: string }>()
  type LinkRow = {
    client_id: string | null
    prospect_id: string | null
    rola: string
    persons:
      | { imie: string; nazwisko: string }
      | { imie: string; nazwisko: string }[]
      | null
  }
  for (const l of ((links ?? []) as unknown) as LinkRow[]) {
    const eid = l.client_id ?? l.prospect_id
    if (!eid || dmByEntity.has(eid)) continue
    const p = Array.isArray(l.persons) ? l.persons[0] : l.persons
    if (p) dmByEntity.set(eid, { name: `${p.imie} ${p.nazwisko}`, role: l.rola })
  }

  // Cold openers
  const { data: openers } = await supabase
    .from('cohort_cold_openers')
    .select('client_id, prospect_id, opener_text, generated_at')
    .or(`client_id.in.(${clientIds.join(',') || '00000000-0000-0000-0000-000000000000'}),prospect_id.in.(${prospectIds.join(',') || '00000000-0000-0000-0000-000000000000'})`)
    .order('generated_at', { ascending: false })

  const openerByEntity = new Map<string, string>()
  for (const o of (openers ?? []) as Array<{
    client_id: string | null
    prospect_id: string | null
    opener_text: string
  }>) {
    const eid = o.client_id ?? o.prospect_id
    if (eid && !openerByEntity.has(eid)) openerByEntity.set(eid, o.opener_text)
  }

  // Build rows у rank order
  const rows: CohortRow[] = c.entity_ids.map((e) => {
    if (e.type === 'client') {
      const cli = clientsMap.get(e.id) as
        | {
            title: string
            nip: string
            krs_legal_form: string | null
            region: string | null
            city: string | null
            business_profile: { buyer_strength_for_chm?: number } | null
            phone: string | null
            email: string | null
            website: string | null
          }
        | undefined
      const tm = topMatchByEntity.get(e.id)
      const dm = dmByEntity.get(e.id)
      return {
        rank: e.rank,
        entity_id: e.id,
        entity_type: 'client',
        name: cli?.title ?? '?',
        nip: cli?.nip ?? '?',
        legal_form: cli?.krs_legal_form ?? null,
        region: cli?.region ?? null,
        city: cli?.city ?? null,
        top_product: tm?.product ?? null,
        family_name: tm?.family ?? null,
        combined_score: tm?.score ?? null,
        buyer_strength: cli?.business_profile?.buyer_strength_for_chm ?? null,
        phone: cli?.phone ?? null,
        email: cli?.email ?? null,
        website: cli?.website ?? null,
        decision_maker: dm?.name ?? null,
        decision_maker_role: dm?.role ?? null,
        cold_opener: openerByEntity.get(e.id) ?? null,
      }
    }
    const pro = prospectsMap.get(e.id) as
      | {
          name: string
          nip: string
          krs_legal_form: string | null
          wojewodztwo: string | null
          miejscowosc: string | null
          telefon: string | null
          email: string | null
          www: string | null
        }
      | undefined
    const tm = topMatchByEntity.get(e.id)
    const dm = dmByEntity.get(e.id)
    return {
      rank: e.rank,
      entity_id: e.id,
      entity_type: 'prospect',
      name: pro?.name ?? '?',
      nip: pro?.nip ?? '?',
      legal_form: pro?.krs_legal_form ?? null,
      region: pro?.wojewodztwo ?? null,
      city: pro?.miejscowosc ?? null,
      top_product: tm?.product ?? null,
      family_name: tm?.family ?? null,
      combined_score: tm?.score ?? null,
      buyer_strength: null,
      phone: pro?.telefon ?? null,
      email: pro?.email ?? null,
      website: pro?.www ?? null,
      decision_maker: dm?.name ?? null,
      decision_maker_role: dm?.role ?? null,
      cold_opener: openerByEntity.get(e.id) ?? null,
    }
  })

  return { cohort_name: c.cohort_name, created_at: c.created_at, rows }
}

export default async function PiknikoHandoffPage() {
  const data = await fetchCohortRows()
  if (!data) notFound()

  const { cohort_name, created_at, rows } = data
  const familyCounts = new Map<string, number>()
  for (const r of rows) {
    if (r.family_name) familyCounts.set(r.family_name, (familyCounts.get(r.family_name) ?? 0) + 1)
  }
  const withContact = rows.filter((r) => r.phone || r.email || r.website).length
  const withDM = rows.filter((r) => r.decision_maker).length

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Cohort dla Pikniko"
        breadcrumbs={[{ label: 'Handoff' }, { label: 'Pikniko' }]}
        actions={<ExportButtons rows={rows} cohortName={cohort_name} />}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{cohort_name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm">
            <span>
              <span className="text-muted-foreground">Liczność:</span>{' '}
              <span className="font-semibold">{rows.length}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Z kontaktem:</span>{' '}
              <span className="font-semibold">{withContact}/{rows.length}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Z osobą decyzyjną:</span>{' '}
              <span className="font-semibold">{withDM}/{rows.length}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Utworzono:</span>{' '}
              <span>{new Date(created_at).toLocaleString('pl-PL')}</span>
            </span>
            <div className="flex flex-wrap gap-2 ml-auto">
              {[...familyCounts.entries()].map(([f, n]) => (
                <Badge key={f} variant="outline">
                  {f}: {n}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <CohortFilters families={FAMILIES} />

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-10">#</th>
                    <th className="px-3 py-2 text-left font-medium">Firma · NIP</th>
                    <th className="px-3 py-2 text-left font-medium">Forma</th>
                    <th className="px-3 py-2 text-left font-medium">Top match</th>
                    <th className="px-3 py-2 text-left font-medium">Sygnał</th>
                    <th className="px-3 py-2 text-left font-medium">Kontakt</th>
                    <th className="px-3 py-2 text-left font-medium">Decyzyjny</th>
                    <th className="px-3 py-2 text-left font-medium">Cold opener</th>
                  </tr>
                </thead>
                <tbody className="cohort-rows">
                  {rows.map((r) => (
                    <tr
                      key={r.entity_id}
                      className="border-b cohort-row hover:bg-muted/20"
                      data-family={r.family_name ?? ''}
                      data-has-contact={Boolean(r.phone || r.email || r.website) ? '1' : '0'}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.rank}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={
                            r.entity_type === 'client'
                              ? `/clients/${r.entity_id}`
                              : `/prospects/${r.entity_id}`
                          }
                          className="font-medium hover:underline"
                        >
                          {r.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          NIP {r.nip}
                          {r.city && <span> · {r.city}</span>}
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px] uppercase"
                          >
                            {r.entity_type}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.legal_form ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div>{r.top_product ?? '—'}</div>
                        <div className="text-xs">
                          <Badge variant="outline" className="text-[10px]">
                            {r.family_name ?? '?'}
                          </Badge>
                          <span className="ml-2 font-mono">{r.combined_score ?? '—'}/100</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-[10px] uppercase text-orange-600">PKD exact</div>
                        {r.buyer_strength !== null && (
                          <div className="text-xs">strength {r.buyer_strength}/100</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5 text-xs">
                          {r.phone && (
                            <span className="flex items-center gap-1">
                              <PhoneIcon className="size-3" />
                              <span className="font-mono">{r.phone}</span>
                            </span>
                          )}
                          {r.email && (
                            <span className="flex items-center gap-1">
                              <MailIcon className="size-3" />
                              <span className="font-mono">{r.email}</span>
                            </span>
                          )}
                          {r.website && (
                            <a
                              href={r.website.startsWith('http') ? r.website : `https://${r.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 hover:underline"
                            >
                              <GlobeIcon className="size-3" />
                              <span className="truncate max-w-[180px]">{r.website}</span>
                            </a>
                          )}
                          {!r.phone && !r.email && !r.website && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.decision_maker ? (
                          <div className="flex items-center gap-1">
                            <UsersIcon className="size-3" />
                            <div>
                              <div>{r.decision_maker}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {r.decision_maker_role}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[280px]">
                        <ColdOpenerCell text={r.cold_opener} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
