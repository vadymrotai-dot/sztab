'use client'

// KRS Open API enrichment section. Shared между clients + prospects.
// Higher value-add than GUS: PKD codes z opisami + board members (anonim).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCwIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { EnrichmentSection } from './enrichment-section'

export interface KrsBoardMember {
  function: string | null
  index: number
}

export interface KrsPkdEntry {
  kod: string
  opis: string | null
  isMain: boolean
}

export interface KrsData {
  krs_number: string | null
  krs_full_name: string | null
  krs_legal_form: string | null
  krs_registration_date: string | null
  krs_status: string | null
  krs_management_board: KrsBoardMember[] | null
  krs_pkd_with_descriptions: KrsPkdEntry[] | null
  krs_last_checked: string | null
}

interface Props {
  targetType: 'prospect' | 'client'
  targetId: string
  initial: KrsData
}

const STATUS_BADGE: Record<string, string> = {
  aktywny: 'bg-emerald-100 text-emerald-800 border-transparent',
  likwidacja: 'bg-amber-100 text-amber-800 border-transparent',
  upadlosc: 'bg-red-100 text-red-800 border-transparent',
  wykreslony: 'bg-slate-200 text-slate-800 border-transparent',
}

const STATUS_LABEL: Record<string, string> = {
  aktywny: 'Aktywny',
  likwidacja: 'W likwidacji',
  upadlosc: 'Upadłość',
  wykreslony: 'Wykreślony',
}

const STATUS_ICON: Record<string, string> = {
  aktywny: '✅',
  likwidacja: '⚠️',
  upadlosc: '🚨',
  wykreslony: '⛔',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pl-PL')
  } catch {
    return iso
  }
}

/** Group board members by function and count. */
function summarizeBoard(board: KrsBoardMember[] | null): Array<{ fn: string; count: number }> {
  if (!board || board.length === 0) return []
  const counts = new Map<string, number>()
  for (const m of board) {
    const fn = m.function ?? 'Członek (nieokreślony)'
    counts.set(fn, (counts.get(fn) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([fn, count]) => ({ fn, count }))
}

export function KrsSection({ targetType, targetId, initial }: Props) {
  const [data, setData] = useState<KrsData>(initial)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const hasKrsNumber = Boolean(data.krs_number)
  const hasData = data.krs_full_name !== null

  const handleRefresh = () => {
    if (!hasKrsNumber) {
      toast.error('Brak numeru KRS — JDG nie podlega rejestracji')
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/enrichment/krs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [`${targetType}_id`]: targetId }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          toast.error(json.error ?? `Błąd KRS (${res.status})`)
          return
        }
        const d = json.data
        setData({
          krs_number: d.krs_number,
          krs_full_name: d.full_name,
          krs_legal_form: d.legal_form,
          krs_registration_date: d.registration_date,
          krs_status: d.status,
          krs_management_board: d.management_board,
          krs_pkd_with_descriptions: d.pkd_with_descriptions,
          krs_last_checked: d.checked_at,
        })
        toast.success(`KRS: ${STATUS_LABEL[d.status ?? ''] ?? 'pobrano'}`)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Błąd sieci')
      }
    })
  }

  const statusBadge = data.krs_status ? (
    <Badge
      variant="outline"
      className={cn('text-xs', STATUS_BADGE[data.krs_status] ?? STATUS_BADGE.wykreslony)}
    >
      {STATUS_LABEL[data.krs_status] ?? data.krs_status}
    </Badge>
  ) : (
    <Badge variant="outline" className="text-xs bg-slate-100 text-slate-600 border-transparent">
      brak danych
    </Badge>
  )

  const icon = STATUS_ICON[data.krs_status ?? ''] ?? (hasKrsNumber ? '🏛️' : '❓')

  // Render: 4 cases
  // 1. No KRS number — disabled section з explanation
  // 2. Has KRS number, no data — "Pobierz z KRS" button
  // 3. Has data — full display
  // 4. Refreshing — same as 3 but з spinner

  if (!hasKrsNumber) {
    return (
      <EnrichmentSection
        title="Rejestr KRS (Ministerstwo Sprawiedliwości)"
        icon={<span aria-hidden>{icon}</span>}
        rightBadge={
          <Badge variant="outline" className="text-xs bg-slate-100 text-slate-600 border-transparent">
            brak KRS
          </Badge>
        }
        hasData={false}
        defaultOpen={false}
      >
        <p className="text-xs text-muted-foreground">
          Brak numeru KRS — ten podmiot to JDG (osoba fizyczna prowadząca działalność gospodarczą)
          lub GUS nie zwrócił numeru rejestracji. KRS dotyczy tylko osób prawnych (sp. z o.o., S.A.,
          stowarzyszeń, fundacji itp.).
        </p>
      </EnrichmentSection>
    )
  }

  const boardSummary = summarizeBoard(data.krs_management_board)
  const pkdMain = data.krs_pkd_with_descriptions?.find((p) => p.isMain)
  const pkdOther = data.krs_pkd_with_descriptions?.filter((p) => !p.isMain) ?? []

  return (
    <EnrichmentSection
      title="Rejestr KRS (Ministerstwo Sprawiedliwości)"
      icon={<span aria-hidden>{icon}</span>}
      rightBadge={statusBadge}
      hasData={hasData}
      lastCheckedLabel={formatDate(data.krs_last_checked)}
    >
      {!hasData ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground">
            Nr KRS: <span className="font-mono">{data.krs_number}</span>. Pobierz pełne dane z
            rejestru.
          </p>
          <Button size="sm" onClick={handleRefresh} disabled={pending}>
            {pending ? 'Pobieranie…' : 'Pobierz z KRS'}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <KV label="Pełna nazwa" value={data.krs_full_name ?? '—'} />
            <KV label="Forma prawna" value={data.krs_legal_form ?? '—'} />
            <KV label="Numer KRS" value={data.krs_number ?? '—'} mono />
            <KV label="Data rejestracji" value={data.krs_registration_date ?? '—'} />
          </div>

          {boardSummary.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Skład zarządu / reprezentacja (anonimowo per RODO)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {boardSummary.map((b) => (
                  <Badge
                    key={b.fn}
                    variant="outline"
                    className="text-xs bg-blue-50 text-blue-800 border-transparent"
                  >
                    {b.fn} × {b.count}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {pkdMain && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Główne PKD (przedmiot przeważającej działalności)
              </p>
              <div className="rounded-md border bg-blue-50/30 p-2 text-sm">
                <span className="font-mono text-xs font-semibold">{pkdMain.kod}</span>
                {pkdMain.opis && <span className="ml-2 text-muted-foreground">— {pkdMain.opis}</span>}
              </div>
            </div>
          )}

          {pkdOther.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Pozostała działalność ({pkdOther.length})
              </p>
              <ul className="space-y-1">
                {pkdOther.slice(0, 15).map((p, idx) => (
                  <li key={`${p.kod}-${idx}`} className="text-xs">
                    <span className="font-mono font-semibold">{p.kod}</span>
                    {p.opis && <span className="ml-2 text-muted-foreground">— {p.opis}</span>}
                  </li>
                ))}
                {pkdOther.length > 15 && (
                  <li className="text-xs text-muted-foreground">
                    +{pkdOther.length - 15} więcej (zobacz raw_data)
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={pending}>
              <RefreshCwIcon className={cn('mr-1 size-3', pending && 'animate-spin')} />
              {pending ? 'Odświeżanie…' : 'Odśwież z KRS'}
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
