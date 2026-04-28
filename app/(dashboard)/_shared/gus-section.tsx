'use client'

// GUS (Rejestr REGON) enrichment section. Shared between clients +
// prospects detail pages.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCwIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { EnrichmentSection } from './enrichment-section'

export interface GusData {
  gus_legal_name: string | null
  gus_regon: string | null
  gus_status: string | null
  registered_date: string | null
  employee_count_range: string | null
  pkd_codes: string[] | null
  gus_last_checked: string | null
}

interface Props {
  targetType: 'prospect' | 'client'
  targetId: string
  initial: GusData
  hasNip: boolean
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-transparent',
  suspended: 'bg-amber-100 text-amber-800 border-transparent',
  liquidation: 'bg-orange-100 text-orange-800 border-transparent',
  deregistered: 'bg-red-100 text-red-800 border-transparent',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktywny',
  suspended: 'Zawieszony',
  liquidation: 'W likwidacji',
  deregistered: 'Wykreślony',
}

const EMPLOYEE_BADGE: Record<string, string> = {
  '0': 'bg-slate-100 text-slate-700 border-transparent',
  '1-9': 'bg-blue-100 text-blue-700 border-transparent',
  '10-49': 'bg-indigo-100 text-indigo-800 border-transparent',
  '50-249': 'bg-purple-100 text-purple-800 border-transparent',
  '250+': 'bg-fuchsia-100 text-fuchsia-800 border-transparent',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pl-PL')
  } catch {
    return iso
  }
}

export function GusSection({ targetType, targetId, initial, hasNip }: Props) {
  const [data, setData] = useState<GusData>(initial)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const hasData = data.gus_regon !== null

  const handleRefresh = () => {
    if (!hasNip) {
      toast.error('Rekord nie ma NIP — nie można wzbogacić')
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/enrichment/gus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [`${targetType}_id`]: targetId }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          toast.error(json.error ?? `Błąd GUS (${res.status})`)
          return
        }
        const d = json.data
        if (!d?.found) {
          toast.error('Nie znaleziono w rejestrze GUS')
          return
        }
        setData({
          gus_legal_name: d.legal_name,
          gus_regon: d.regon,
          gus_status: d.status,
          registered_date: d.registered_date,
          employee_count_range: d.employee_count_range,
          pkd_codes: d.pkd_codes,
          gus_last_checked: d.checked_at,
        })
        toast.success(`GUS: ${STATUS_LABEL[d.status ?? ''] ?? d.status ?? 'pobrano'}`)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Błąd sieci')
      }
    })
  }

  const statusBadge = data.gus_status ? (
    <Badge
      variant="outline"
      className={cn('text-xs', STATUS_BADGE[data.gus_status] ?? STATUS_BADGE.deregistered)}
    >
      {STATUS_LABEL[data.gus_status] ?? data.gus_status}
    </Badge>
  ) : (
    <Badge variant="outline" className="text-xs bg-slate-100 text-slate-600 border-transparent">
      brak danych
    </Badge>
  )

  const icon = data.gus_status === 'active' ? '🏢' : data.gus_status ? '⚠️' : '❓'

  return (
    <EnrichmentSection
      title="Dane operacyjne (GUS REGON)"
      icon={<span aria-hidden>{icon}</span>}
      rightBadge={statusBadge}
      hasData={hasData}
      lastCheckedLabel={formatDate(data.gus_last_checked)}
    >
      {!hasData ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground">
            Brak danych GUS. {hasNip ? 'Pobierz z rejestru REGON.' : 'Rekord nie ma NIP.'}
          </p>
          <Button size="sm" onClick={handleRefresh} disabled={pending || !hasNip}>
            {pending ? 'Pobieranie…' : 'Pobierz z GUS'}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <KV label="Pełna nazwa prawna" value={data.gus_legal_name ?? '—'} />
            <KV label="REGON" value={data.gus_regon ?? '—'} mono />
            <KV label="Data rejestracji w REGON" value={data.registered_date ?? '—'} />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Liczba pracowników</p>
              <p className="text-sm">
                {data.employee_count_range ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      EMPLOYEE_BADGE[data.employee_count_range] ?? EMPLOYEE_BADGE['1-9'],
                    )}
                  >
                    {data.employee_count_range}
                  </Badge>
                ) : (
                  '—'
                )}
              </p>
            </div>
          </div>
          {data.pkd_codes && data.pkd_codes.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Kody PKD ({data.pkd_codes.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {data.pkd_codes.slice(0, 30).map((code) => (
                  <Badge
                    key={code}
                    variant="outline"
                    className="font-mono text-[10px] bg-slate-50"
                  >
                    {code}
                  </Badge>
                ))}
                {data.pkd_codes.length > 30 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{data.pkd_codes.length - 30} więcej
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={pending}>
              <RefreshCwIcon className={cn('mr-1 size-3', pending && 'animate-spin')} />
              {pending ? 'Odświeżanie…' : 'Odśwież z GUS'}
            </Button>
          </div>
        </>
      )}
    </EnrichmentSection>
  )
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('text-sm', mono && 'font-mono')}>{value}</p>
    </div>
  )
}
