import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  PencilIcon,
  BuildingIcon,
  CalendarIcon,
  DollarSignIcon,
  ListIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { listDealItems } from '@/app/actions/deals'
import {
  DealItemsEditor,
  type ProductOption,
} from '@/components/deals/deal-items-editor'

const stageColors: Record<string, string> = {
  lead: 'bg-slate-500',
  oferta: 'bg-blue-500',
  negocjacje: 'bg-amber-500',
  sample: 'bg-violet-500',
  kontrakt: 'bg-cyan-500',
  wygrana: 'bg-green-500',
  przegrana: 'bg-red-500',
}

const stageLabels: Record<string, string> = {
  lead: 'Lead',
  oferta: 'Oferta',
  negocjacje: 'Negocjacje',
  sample: 'Sample',
  kontrakt: 'Kontrakt',
  wygrana: 'Wygrana',
  przegrana: 'Przegrana',
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: deal }, items, { data: products }] = await Promise.all([
    supabase
      .from('deals')
      .select('*, client:clients(id, title, client_type, contracted_margin_katalog_pct, contracted_margin_docel_pct)')
      .eq('id', id)
      .single(),
    listDealItems(id),
    supabase
      .from('products')
      .select(
        'id, name, gramatura, ean, cost_pln, vat_rate, unit, supplier_id, category, supplier:suppliers(id, name)',
      )
      .order('name', { ascending: true }),
  ])

  if (!deal) {
    notFound()
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      minimumFractionDigits: 0,
    }).format(value)
  }

  const productOptions: ProductOption[] = (products ?? []).map((p) => {
    // PostgREST may return joined supplier as object or single-element
    // array depending on schema introspection — normalize both.
    const supplierRaw = (p as { supplier?: unknown }).supplier
    const supplier = Array.isArray(supplierRaw)
      ? (supplierRaw[0] as { id: string; name: string } | null) ?? null
      : ((supplierRaw as { id: string; name: string } | null) ?? null)
    return {
      id: p.id as string,
      name: p.name as string,
      gramatura: (p.gramatura as string | null) ?? null,
      ean: (p.ean as string | null) ?? null,
      cost_pln: (p.cost_pln as number | null) ?? null,
      vat_rate: (p.vat_rate as number | null) ?? null,
      unit: (p.unit as string | null) ?? null,
      supplier_id: (p.supplier_id as string | null) ?? null,
      supplier_name: supplier?.name ?? null,
      category: (p.category as string | null) ?? null,
    }
  })

  const client = deal.client as
    | {
        id: string
        title: string
        client_type: 'standard' | 'strategic_partner' | null
        contracted_margin_katalog_pct: number | null
        contracted_margin_docel_pct: number | null
      }
    | null

  const totalValue = (deal.total_value as number | null) ?? 0

  return (
    <div className="flex flex-col">
      <PageHeader
        title={deal.title as string}
        breadcrumbs={[
          { label: 'Umowy', href: '/deals' },
          { label: deal.title as string },
        ]}
        actions={
          <div className="flex gap-2">
            {/* TODO Phase 3 Commit 6: gate by owner ownership check on /deals/[id]/margin */}
            <Button asChild variant="outline">
              <Link href={`/deals/${id}/margin`}>💰 Marża</Link>
            </Button>
            <Button asChild>
              <Link href={`/deals/${id}/edit`}>
                <PencilIcon className="mr-2 size-4" />
                Edytuj
              </Link>
            </Button>
          </div>
        }
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-2xl">{deal.title as string}</CardTitle>
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-white',
                    stageColors[deal.stage as string] ?? 'bg-slate-500',
                  )}
                >
                  {stageLabels[deal.stage as string] ?? deal.stage}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <DollarSignIcon className="size-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Wartość (z pozycji)
                    </p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(totalValue)}
                    </p>
                  </div>
                </div>
                {client && (
                  <div className="flex items-center gap-3">
                    <BuildingIcon className="size-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Klient</p>
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-medium hover:underline"
                      >
                        {client.title}
                      </Link>
                      {client.client_type === 'strategic_partner' && (
                        <Badge
                          variant="outline"
                          className="ml-2 bg-purple-100 text-purple-800 border-transparent text-[10px]"
                        >
                          Strategic
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                {(deal.expected_close_date || deal.close_date) && (
                  <div className="flex items-center gap-3">
                    <CalendarIcon className="size-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Planowane zamknięcie
                      </p>
                      <p className="font-medium">
                        {new Date(
                          (deal.expected_close_date as string) ??
                            (deal.close_date as string),
                        ).toLocaleDateString('pl-PL')}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <ListIcon className="size-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Pozycji</p>
                    <p className="font-medium">{items.length}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informacje</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Utworzono</span>
                <span className="text-sm">
                  {new Date(deal.created_at as string).toLocaleDateString('pl-PL')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Ostatnia aktualizacja
                </span>
                <span className="text-sm">
                  {new Date(deal.updated_at as string).toLocaleDateString('pl-PL')}
                </span>
              </div>
              {deal.deal_type ? (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Typ deal-a
                  </span>
                  <span className="text-sm">{deal.deal_type as string}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pozycje</CardTitle>
          </CardHeader>
          <CardContent>
            <DealItemsEditor
              dealId={id}
              initialItems={items}
              products={productOptions}
              clientContext={{
                client_id: client?.id ?? null,
                client_type: client?.client_type ?? null,
                contracted_margin_katalog_pct:
                  client?.contracted_margin_katalog_pct ?? null,
                contracted_margin_docel_pct:
                  client?.contracted_margin_docel_pct ?? null,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
