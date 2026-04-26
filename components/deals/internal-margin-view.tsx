import {
  AlertTriangleIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { DealItem } from '@/lib/types'

const formatPLN = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 2,
})

const formatPct = (v: number) =>
  `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

const marginTone = (pct: number | null): 'good' | 'warn' | 'bad' | 'neutral' => {
  if (pct == null) return 'neutral'
  if (pct < 15) return 'bad'
  if (pct < 25) return 'warn'
  return 'good'
}

const toneClasses: Record<'good' | 'warn' | 'bad' | 'neutral', string> = {
  good: 'bg-green-100 text-green-800 border-transparent',
  warn: 'bg-amber-100 text-amber-800 border-transparent',
  bad: 'bg-red-100 text-red-800 border-transparent',
  neutral: 'bg-muted text-muted-foreground border-transparent',
}

interface InternalMarginViewProps {
  items: DealItem[]
  client: {
    title: string
    client_type: 'standard' | 'strategic_partner' | null
    contracted_margin_katalog_pct: number | null
    contracted_margin_docel_pct: number | null
  } | null
}

export function InternalMarginView({ items, client }: InternalMarginViewProps) {
  const totals = items.reduce(
    (acc, it) => {
      const qty = Number(it.quantity ?? 0)
      const cost = Number(it.unit_price_buy ?? 0)
      const sell = Number(it.unit_price_sell ?? 0)
      const lineCost = cost * qty
      const lineSell = sell * qty
      const lineMarginPln = Number(it.line_margin_pln ?? lineSell - lineCost)
      acc.totalCost += lineCost
      acc.totalSell += lineSell
      acc.totalMargin += lineMarginPln
      if (cost <= 0) acc.missingCost += 1
      return acc
    },
    { totalCost: 0, totalSell: 0, totalMargin: 0, missingCost: 0 },
  )

  const totalMarginPct =
    totals.totalSell > 0 ? (totals.totalMargin / totals.totalSell) * 100 : null

  const overallTone = marginTone(totalMarginPct)

  // Strategic partner contract bands — ostrzegamy gdy aktualna marża
  // schodzi pod docel (czerwony) lub między docel a katalog (żółty).
  const strategicAlert =
    client?.client_type === 'strategic_partner' &&
    totalMarginPct != null &&
    client.contracted_margin_docel_pct != null &&
    totalMarginPct / 100 < client.contracted_margin_docel_pct

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Łączny koszt (zakup)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {formatPLN.format(totals.totalCost)}
            </p>
            {totals.missingCost > 0 && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangleIcon className="size-3" />
                {totals.missingCost} pozycji bez kosztu
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Łączna sprzedaż (netto)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {formatPLN.format(totals.totalSell)}
            </p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            overallTone === 'bad' && 'border-red-300',
            overallTone === 'warn' && 'border-amber-300',
            overallTone === 'good' && 'border-green-300',
          )}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Marża łączna
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                'flex items-center gap-2 text-xl font-semibold tabular-nums',
                overallTone === 'bad' && 'text-red-700',
                overallTone === 'warn' && 'text-amber-700',
                overallTone === 'good' && 'text-green-700',
              )}
            >
              {totalMarginPct != null && totalMarginPct >= 0 ? (
                <TrendingUpIcon className="size-5" />
              ) : (
                <TrendingDownIcon className="size-5" />
              )}
              {formatPLN.format(totals.totalMargin)}
              {totalMarginPct != null && (
                <span className="text-sm font-normal">
                  ({formatPct(totalMarginPct)})
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {client?.client_type === 'strategic_partner' && (
        <Card
          className={cn(
            strategicAlert ? 'border-red-300 bg-red-50' : 'border-purple-200 bg-purple-50',
          )}
        >
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangleIcon
              className={cn(
                'size-5 shrink-0 mt-0.5',
                strategicAlert ? 'text-red-600' : 'text-purple-600',
              )}
            />
            <div className="space-y-1">
              <p className="font-medium">
                Strategic partner: {client.title}
              </p>
              <p className="text-muted-foreground">
                Kontraktowa marża katalog:{' '}
                <strong>
                  {client.contracted_margin_katalog_pct != null
                    ? `${(client.contracted_margin_katalog_pct * 100).toFixed(1)}%`
                    : '—'}
                </strong>
                {'  ·  '}
                docel:{' '}
                <strong>
                  {client.contracted_margin_docel_pct != null
                    ? `${(client.contracted_margin_docel_pct * 100).toFixed(1)}%`
                    : '—'}
                </strong>
              </p>
              {strategicAlert && (
                <p className="text-red-700 font-medium">
                  ⚠ Aktualna marża ({totalMarginPct?.toFixed(1)}%) jest poniżej
                  docel — sprawdź ceny lub renegocjuj kontrakt.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pozycje — koszt vs sprzedaż</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">
              Brak pozycji do analizy.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead className="text-right">Ilość</TableHead>
                    <TableHead className="text-right">Koszt jedn.</TableHead>
                    <TableHead className="text-right">Cena sprzedaży</TableHead>
                    <TableHead className="text-right">Wartość netto</TableHead>
                    <TableHead className="text-right">Marża</TableHead>
                    <TableHead className="text-right">Marża %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const qty = Number(item.quantity ?? 0)
                    const cost = item.unit_price_buy
                    const sell = Number(item.unit_price_sell ?? 0)
                    const lineSell = sell * qty
                    const marginPln = item.line_margin_pln
                    const marginPct = item.line_margin_pct
                    const tone = marginTone(marginPct)
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">
                            {item.product_name_snapshot ?? '(usunięty produkt)'}
                          </div>
                          {item.product_gramatura_snapshot && (
                            <div className="text-xs text-muted-foreground">
                              {item.product_gramatura_snapshot}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {qty} {item.unit ?? 'szt'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {cost != null ? (
                            formatPLN.format(Number(cost))
                          ) : (
                            <span className="text-amber-600">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPLN.format(sell)}
                          {item.unit_price_override && (
                            <span
                              className="ml-1 text-[10px] text-amber-600"
                              title="Cena nadpisana ręcznie"
                            >
                              ✎
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPLN.format(lineSell)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {marginPln != null ? (
                            formatPLN.format(Number(marginPln))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {marginPct != null ? (
                            <Badge
                              variant="outline"
                              className={cn('tabular-nums', toneClasses[tone])}
                            >
                              {formatPct(Number(marginPct))}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              brak kosztu
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
