// app/(dashboard)/sprzedaz/page.tsx
// Sprint O Phase 2 — wrapper з 3 tabs (Umowy / Generator KP / Kohorty).

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlusIcon, BriefcaseIcon } from 'lucide-react'
import { DealsKanban } from '@/components/deals/deals-kanban'
import { KPGeneratorContent } from '@/components/kp-generator/kp-generator-content'
import { SprzedazTabs } from '@/components/sprzedaz/sprzedaz-tabs'

export default async function SprzedazPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sp = await searchParams
  const tab = sp.tab ?? 'umowy'
  const supabase = await createClient()

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Sprzedaż"
        actions={
          tab === 'umowy' ? (
            <Button size="lg" asChild>
              <Link href="/deals/new">
                <PlusIcon className="mr-2 size-4" />
                Nowa umowa
              </Link>
            </Button>
          ) : null
        }
      />
      <SprzedazTabs />
      <div className="flex-1 overflow-auto">
        {tab === 'umowy' && <UmowyContent supabase={supabase} />}
        {tab === 'kp' && <KpContent supabase={supabase} />}
        {tab === 'kohorty' && <KohortyContent supabase={supabase} />}
      </div>
    </div>
  )
}

async function UmowyContent({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  const { data: deals } = await supabase
    .from('deals')
    .select(
      '*, client:clients(id, title, client_type, contracted_margin_katalog_pct, contracted_margin_docel_pct), deal_items(count)',
    )
    .order('updated_at', { ascending: false })
  return <DealsKanban deals={deals || []} />
}

async function KpContent({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  const [{ data: clients }, { data: products }] = await Promise.all([
    supabase.from('clients').select('id, title, nip, city, address').order('title', { ascending: true }),
    supabase.from('products').select('*').order('name', { ascending: true }),
  ])
  return <KPGeneratorContent clients={clients || []} products={products || []} />
}

// Sprint S-CLEAN ETAP 2 STEP 3 (13.05.2026) — KohortyContent swap:
// pikniko_handoff_cohorts → unified cohorts + cohort_members. Single source
// of truth з /intelligence/cohorts. Rows clickable → /intelligence/cohorts/{id}.

interface CohortRow {
  id: string
  name: string
  description: string | null
  created_at: string
  member_count: number
  client_count: number
  prospect_count: number
}

async function KohortyContent({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  const [{ data: cohorts }, { data: allMembers }] = await Promise.all([
    supabase
      .from('cohorts')
      .select('id, name, description, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('cohort_members').select('cohort_id, subject_type'),
  ])

  // Aggregate split counts per cohort_id (same pattern як
  // /intelligence/cohorts/page.tsx).
  const splitMap = new Map<string, { client: number; prospect: number }>()
  for (const m of (allMembers ?? []) as Array<{
    cohort_id: string
    subject_type: 'prospect' | 'client'
  }>) {
    if (!splitMap.has(m.cohort_id)) {
      splitMap.set(m.cohort_id, { client: 0, prospect: 0 })
    }
    const b = splitMap.get(m.cohort_id)!
    if (m.subject_type === 'client') b.client++
    else b.prospect++
  }

  const rows: CohortRow[] = ((cohorts ?? []) as Array<{
    id: string
    name: string
    description: string | null
    created_at: string
  }>).map((c) => {
    const split = splitMap.get(c.id) ?? { client: 0, prospect: 0 }
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      created_at: c.created_at,
      member_count: split.client + split.prospect,
      client_count: split.client,
      prospect_count: split.prospect,
    }
  })

  if (rows.length === 0) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BriefcaseIcon className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-md">
              Jeszcze brak kohort. Wygeneruj nową w <strong>Klienci</strong> →
              zaznacz wiersze → <strong>Akcje grupowe</strong> → Eksport jako
              kohorta.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6">
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Nazwa kohorty</th>
                <th className="px-4 py-2 text-left font-medium">Liczność</th>
                <th className="px-4 py-2 text-left font-medium">Klienci/Prospекti</th>
                <th className="px-4 py-2 text-left font-medium">Utworzono</th>
                <th className="px-4 py-2 text-right font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-2 font-medium">
                    <Link
                      href={`/intelligence/cohorts/${r.id}`}
                      className="hover:underline"
                    >
                      {r.name}
                    </Link>
                    {r.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {r.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline">{r.member_count}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {r.client_count} klientów / {r.prospect_count} prospекtów
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString('pl-PL')}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/intelligence/cohorts/${r.id}`}>Otwórz</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
