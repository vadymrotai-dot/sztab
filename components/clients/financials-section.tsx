// components/clients/financials-section.tsx
// Sprint K — sprawozdania finansowe display з 3-year bar chart placeholder.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUpIcon, TrendingDownIcon } from 'lucide-react'

interface Financials {
  rok: number
  przychody_pln: number | null
  zysk_netto_pln: number | null
  marza_netto: number | null
  aktywa_pln: number | null
  kapital_wlasny_pln: number | null
  zatrudnienie: number | null
  source_url: string | null
}

function formatPln(v: number | null): string {
  if (v === null || v === undefined) return '—'
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return Math.round(v).toString()
}

export function FinancialsSection({ data }: { data: Financials[] }) {
  if (data.length === 0) {
    return (
      <Card className="border-l-4 border-l-orange-400">
        <CardHeader>
          <CardTitle className="text-base">Finanse · sprawozdania KRS</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Brak sprawozdań finansowych. JDG nie publikuje sprawozdań — tylko sp. z o.o./S.A. mają obowiązek.
          </p>
        </CardContent>
      </Card>
    )
  }

  const sorted = [...data].sort((a, b) => b.rok - a.rok)
  const latest = sorted[0]
  const previous = sorted[1]
  const growth =
    latest && previous && latest.przychody_pln && previous.przychody_pln && previous.przychody_pln !== 0
      ? ((latest.przychody_pln - previous.przychody_pln) / previous.przychody_pln) * 100
      : null

  // Bar chart values (max-relative)
  const maxRevenue = Math.max(...sorted.map((s) => s.przychody_pln ?? 0))

  return (
    <Card className="border-l-4 border-l-orange-400">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <CardTitle className="text-base">Finanse · sprawozdania KRS</CardTitle>
        {growth !== null && (
          <Badge
            className={
              growth > 0 ? 'bg-green-600 text-white' : growth < 0 ? 'bg-red-600 text-white' : ''
            }
          >
            {growth > 0 ? <TrendingUpIcon className="size-3 mr-1" /> : <TrendingDownIcon className="size-3 mr-1" />}
            {growth > 0 ? '+' : ''}
            {growth.toFixed(1)}% YoY
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bar chart przychody */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Przychody (PLN)</div>
          {sorted.slice(0, 5).reverse().map((s) => {
            const pct = maxRevenue > 0 && s.przychody_pln ? (s.przychody_pln / maxRevenue) * 100 : 0
            return (
              <div key={s.rok} className="flex items-center gap-2 text-xs">
                <span className="w-12 font-mono text-muted-foreground">{s.rok}</span>
                <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-20 text-right font-mono">{formatPln(s.przychody_pln)}</span>
              </div>
            )
          })}
        </div>

        {/* Latest year detailed */}
        {latest && (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Metric label="Zysk netto" value={formatPln(latest.zysk_netto_pln)} />
            <Metric
              label="Marża netto"
              value={latest.marza_netto !== null ? `${latest.marza_netto.toFixed(1)}%` : '—'}
            />
            <Metric label="Aktywa" value={formatPln(latest.aktywa_pln)} />
            <Metric label="Kapitał własny" value={formatPln(latest.kapital_wlasny_pln)} />
            <Metric
              label="Zatrudnienie"
              value={latest.zatrudnienie !== null ? `${latest.zatrudnienie} osób` : '—'}
            />
            <Metric label="Rok bilansu" value={String(latest.rok)} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-background p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}
