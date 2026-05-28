'use client'

// VAT (Biała Lista) enrichment section. Shared between clients +
// prospects detail pages.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CopyIcon, RefreshCwIcon, CheckIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { EnrichmentSection } from './enrichment-section'

export interface VatData {
  vat_status: string | null
  vat_registered_date: string | null
  vat_bank_accounts: string[] | null
  vat_last_checked: string | null
}

interface Props {
  targetType: 'prospect' | 'client'
  targetId: string
  initial: VatData
  hasNip: boolean
}

const STATUS_BADGE: Record<string, string> = {
  Czynny: 'bg-emerald-100 text-emerald-800 border-transparent',
  Zwolniony: 'bg-amber-100 text-amber-800 border-transparent',
  Niezarejestrowany: 'bg-slate-100 text-slate-700 border-transparent',
  Wykreślony: 'bg-red-100 text-red-800 border-transparent',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })
  } catch {
    return iso
  }
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`Skopiowano${label ? ` ${label}` : ''}`)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Nie udało się skopiować')
    }
  }
  return (
    <Button variant="ghost" size="icon" className="size-6" onClick={handle} type="button">
      {copied ? <CheckIcon className="size-3 text-emerald-600" /> : <CopyIcon className="size-3" />}
    </Button>
  )
}

export function VatSection({ targetType, targetId, initial, hasNip }: Props) {
  const [data, setData] = useState<VatData>(initial)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const hasData = data.vat_status !== null

  const handleRefresh = () => {
    if (!hasNip) {
      toast.error('Rekord nie ma NIP — nie można wzbogacić')
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/enrichment/vat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [`${targetType}_id`]: targetId }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          toast.error(json.error ?? `Błąd VAT (${res.status})`)
          return
        }
        const d = json.data
        setData({
          vat_status: d.status,
          vat_registered_date: d.registered_date,
          vat_bank_accounts: d.bank_accounts,
          vat_last_checked: d.checked_at,
        })
        toast.success(`VAT: ${d.status ?? 'pobrano'}`)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Błąd sieci')
      }
    })
  }

  const statusBadge = data.vat_status ? (
    <Badge variant="outline" className={cn('text-xs', STATUS_BADGE[data.vat_status] ?? STATUS_BADGE.Niezarejestrowany)}>
      {data.vat_status}
    </Badge>
  ) : (
    <Badge variant="outline" className="text-xs bg-slate-100 text-slate-600 border-transparent">
      brak danych
    </Badge>
  )

  const icon = data.vat_status === 'Czynny' ? '✅' : data.vat_status === 'Wykreślony' ? '❌' : '❓'

  return (
    <EnrichmentSection
      title="Status VAT (Biała Lista)"
      icon={<span aria-hidden>{icon}</span>}
      rightBadge={statusBadge}
      hasData={hasData}
      lastCheckedLabel={formatDate(data.vat_last_checked)}
    >
      {!hasData ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground">
            Brak danych VAT. {hasNip ? 'Pobierz z wykazu Ministerstwa Finansów.' : 'Rekord nie ma NIP.'}
          </p>
          <Button size="sm" onClick={handleRefresh} disabled={pending || !hasNip}>
            {pending ? 'Pobieranie…' : 'Pobierz z VAT'}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <KV label="Data rejestracji VAT" value={data.vat_registered_date ?? '—'} />
            <KV
              label="Status"
              value={data.vat_status ?? '—'}
            />
          </div>
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Numery rachunków bankowych ({data.vat_bank_accounts?.length ?? 0})
            </p>
            {data.vat_bank_accounts && data.vat_bank_accounts.length > 0 ? (
              <ul className="space-y-1">
                {data.vat_bank_accounts.map((acc) => (
                  <li key={acc} className="flex items-center gap-2">
                    <span className="font-mono text-xs">{acc}</span>
                    <CopyButton value={acc} label="numer rachunku" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Brak rachunków na białej liście</p>
            )}
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={pending}>
              <RefreshCwIcon className={cn('mr-1 size-3', pending && 'animate-spin')} />
              {pending ? 'Odświeżanie…' : 'Odśwież z Białej Listy'}
            </Button>
          </div>
        </>
      )}
    </EnrichmentSection>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  )
}
