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

interface CohortRow {
  id: string
  cohort_name: string
  total_entities: number
  created_at: string
  metadata: { distribution?: { clients: number; prospects: number } } | null
}

async function KohortyContent({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  const { data } = await supabase
    .from('pikniko_handoff_cohorts')
    .select('id, cohort_name, total_entities, created_at, metadata')
    .order('created_at', { ascending: false })
  const rows = ((data ?? []) as unknown) as CohortRow[]

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
              {rows.map((r) => {
                const dist = r.metadata?.distribution
                return (
                  <tr key={r.id} className="border-b hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{r.cohort_name}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline">{r.total_entities}</Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {dist
                        ? `${dist.clients ?? 0} klientów / ${dist.prospects ?? 0} prospекtów`
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString('pl-PL')}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/handoff/pikniko?cohort=${r.id}`}>Otwórz</Link>
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
