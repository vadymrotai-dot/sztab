// components/clients/buying-signals-section.tsx
// Sprint K — BZP wins/active tenders display.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrophyIcon } from 'lucide-react'

interface BzpTender {
  id: string
  bzp_notice_id: string
  ordering_party: string | null
  ordering_party_type: string | null
  cpv_codes: string[]
  subject: string | null
  award_value_pln: number | null
  award_date: string | null
}

export function BuyingSignalsSection({ tenders }: { tenders: BzpTender[] }) {
  if (tenders.length === 0) {
    return (
      <Card className="border-l-4 border-l-orange-400">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrophyIcon className="size-5 text-orange-500" />
            Przetargi i zamówienia publiczne (BZP)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Brak wygranych przetargów w BZP. To może być JDG / mała firma która nie startuje
            w przetargach publicznych — to normalne.
          </p>
        </CardContent>
      </Card>
    )
  }

  const totalValue = tenders.reduce((sum, t) => sum + (t.award_value_pln ?? 0), 0)

  return (
    <Card className="border-l-4 border-l-orange-400">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrophyIcon className="size-5 text-orange-500" />
          Przetargi i zamówienia publiczne (BZP)
        </CardTitle>
        <div className="text-right text-xs">
          <div className="text-muted-foreground">{tenders.length} wygranych</div>
          {totalValue > 0 && (
            <div className="font-semibold">
              {Math.round(totalValue).toLocaleString('pl-PL')} PLN
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {tenders.slice(0, 8).map((t) => (
            <li key={t.id} className="grid grid-cols-12 items-start gap-2 py-2">
              <div className="col-span-2 text-xs font-mono text-muted-foreground pt-0.5">
                {t.award_date ? new Date(t.award_date).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }) : '—'}
              </div>
              <div className="col-span-7 min-w-0 space-y-1">
                <div className="font-medium text-sm truncate" title={t.subject ?? undefined}>
                  {t.subject ?? '(brak tematu)'}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{t.ordering_party ?? '—'}</span>
                  {t.ordering_party_type && (
                    <Badge variant="outline" className="h-4 text-[10px]">
                      {t.ordering_party_type}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {t.cpv_codes.slice(0, 3).map((c, idx) => (
                    <Badge key={idx} variant="outline" className="h-4 text-[9px] font-mono">
                      CPV {c}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="col-span-3 text-right space-y-1">
                {t.award_value_pln && (
                  <div className="font-semibold text-sm">
                    {Math.round(t.award_value_pln).toLocaleString('pl-PL')} PLN
                  </div>
                )}
                <div className="font-mono text-[10px] text-muted-foreground truncate">
                  {t.bzp_notice_id}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {tenders.length > 8 && (
          <p className="mt-2 text-xs text-muted-foreground">+ {tenders.length - 8} więcej</p>
        )}
      </CardContent>
    </Card>
  )
}
