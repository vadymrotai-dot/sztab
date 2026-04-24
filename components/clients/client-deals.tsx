'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Deal } from '@/lib/types'
import { PlusIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClientDealsProps {
  clientId: string
  deals: Deal[]
}

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

export function ClientDeals({ clientId, deals }: ClientDealsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      minimumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button asChild>
          <Link href={`/deals/new?client=${clientId}`}>
            <PlusIcon className="mr-2 size-4" />
            Nowa umowa
          </Link>
        </Button>
      </div>

      {deals.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Brak umow dla tego klienta
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {deals.map((deal) => (
            <Card key={deal.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <Link href={`/deals/${deal.id}`} className="font-medium hover:underline">
                    {deal.title}
                  </Link>
                  {deal.close_date && (
                    <p className="text-sm text-muted-foreground">
                      Planowane zamkniecie: {new Date(deal.close_date).toLocaleDateString('pl-PL')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-medium">{formatCurrency(deal.amount)}</span>
                  <Badge variant="secondary" className={cn('text-white', stageColors[deal.stage])}>
                    {stageLabels[deal.stage]}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
