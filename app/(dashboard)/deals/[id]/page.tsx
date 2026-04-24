import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PencilIcon, BuildingIcon, CalendarIcon, DollarSignIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const stageColors: Record<string, string> = {
  lead: 'bg-slate-500',
  oferta: 'bg-blue-500',
  negocjacje: 'bg-amber-500',
  wygrana: 'bg-green-500',
  przegrana: 'bg-red-500',
}

const stageLabels: Record<string, string> = {
  lead: 'Lead',
  oferta: 'Oferta',
  negocjacje: 'Negocjacje',
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

  const { data: deal } = await supabase
    .from('deals')
    .select('*, client:clients(id, title)')
    .eq('id', id)
    .single()

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

  return (
    <div className="flex flex-col">
      <PageHeader
        title={deal.title}
        breadcrumbs={[
          { label: 'Umowy', href: '/deals' },
          { label: deal.title },
        ]}
        actions={
          <Button asChild>
            <Link href={`/deals/${id}/edit`}>
              <PencilIcon className="mr-2 size-4" />
              Edytuj
            </Link>
          </Button>
        }
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-2xl">{deal.title}</CardTitle>
                <Badge variant="secondary" className={cn('text-white', stageColors[deal.stage])}>
                  {stageLabels[deal.stage]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <DollarSignIcon className="size-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Wartosc</p>
                    <p className="text-lg font-semibold">{formatCurrency(deal.amount)}</p>
                  </div>
                </div>
                {deal.client && (
                  <div className="flex items-center gap-3">
                    <BuildingIcon className="size-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Klient</p>
                      <Link href={`/clients/${deal.client.id}`} className="font-medium hover:underline">
                        {deal.client.title}
                      </Link>
                    </div>
                  </div>
                )}
                {deal.close_date && (
                  <div className="flex items-center gap-3">
                    <CalendarIcon className="size-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Planowane zamkniecie</p>
                      <p className="font-medium">{new Date(deal.close_date).toLocaleDateString('pl-PL')}</p>
                    </div>
                  </div>
                )}
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
                <span className="text-sm">{new Date(deal.created_at).toLocaleDateString('pl-PL')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Ostatnia aktualizacja</span>
                <span className="text-sm">{new Date(deal.updated_at).toLocaleDateString('pl-PL')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
