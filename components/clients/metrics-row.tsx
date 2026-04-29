// components/clients/metrics-row.tsx
// Sprint M FIX 5 — 4 metric cards у одному row на /clients/[id].

import { Card, CardContent } from '@/components/ui/card'
import { TrendingUpIcon, BanknoteIcon, UsersIcon, TargetIcon } from 'lucide-react'

interface Props {
  bzpCount: number
  latestRevenuePln: number | null
  employeeRange: string | null
  topMatchScore: number | null
}

function formatPln(value: number | null): string {
  if (value === null) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} mln zł`
  if (value >= 1_000) return `${Math.round(value / 1_000)} tys. zł`
  return `${Math.round(value)} zł`
}

const EMPLOYEE_LABEL_PL: Record<string, string> = {
  '0': '0',
  '1-9': '1-9',
  '10-49': '10-49',
  '50-249': '50-249',
  '250+': '250+',
}

export function MetricsRow({
  bzpCount,
  latestRevenuePln,
  employeeRange,
  topMatchScore,
}: Props) {
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
      <MetricCard
        icon={<TrendingUpIcon className="size-5 text-orange-500" />}
        label="Sygnał kupiecki"
        value={bzpCount > 0 ? `${bzpCount} przetarg${bzpCount === 1 ? '' : bzpCount < 5 ? 'y' : 'ów'}` : 'Brak'}
        accent={bzpCount > 0}
      />
      <MetricCard
        icon={<BanknoteIcon className="size-5 text-emerald-600" />}
        label="Obroty"
        value={formatPln(latestRevenuePln)}
        accent={latestRevenuePln !== null}
      />
      <MetricCard
        icon={<UsersIcon className="size-5 text-blue-600" />}
        label="Pracownicy"
        value={employeeRange ? (EMPLOYEE_LABEL_PL[employeeRange] ?? employeeRange) : '—'}
        accent={employeeRange !== null}
      />
      <MetricCard
        icon={<TargetIcon className="size-5 text-purple-600" />}
        label="Dopasowanie Sztab"
        value={topMatchScore !== null ? `${topMatchScore}/100` : '—'}
        accent={(topMatchScore ?? 0) >= 60}
      />
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: boolean
}) {
  return (
    <Card className={accent ? 'border-l-4 border-l-orange-400' : ''}>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <span className="text-xl font-semibold">{value}</span>
      </CardContent>
    </Card>
  )
}
