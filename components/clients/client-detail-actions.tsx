'use client'

// components/clients/client-detail-actions.tsx
// Sprint S4 Phase 1B — wired ActionBar dla /clients/[id]. Closes the
// "де кнопка аналізу" gap.
// Sprint S6A Step 4 (FINAL) — primary CTA rewired до Protocol 13
// "Analiza klienta": POST /api/clients/[id]/full-analysis (Step 1
// wrapper) → triggers Phase A + Phase B з AI_match_rescore (Step 2).
// Menu "Pobierz z KRS" → "Refresh KRS only" з POST до
// /api/clients/[id]/krs-refresh (existing S5B-1 endpoint).
// Sonner toast feedback dla nowych handlers (mirror KrsRefreshButton).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { SparklesIcon, RefreshCwIcon, PencilIcon, DownloadIcon, RefreshCcwIcon, Trash2Icon } from 'lucide-react'
import { ActionBar } from '@/components/action-bar'
import { deleteClientRecord } from '@/app/actions/clients'

interface Props {
  clientId: string
  nip: string | null
  hasProfile: boolean
}

interface FullAnalysisResponse {
  ok: boolean
  error?: string
  response?: {
    phase_b_pending?: string[]
    sources_completed?: Array<{ source: string; status: string }>
  }
  phase?: string
  enrichment_pending?: boolean
}

interface KrsRefreshResponse {
  ok: boolean
  error?: string
  fields_updated?: number
  sprawozdania_added?: number
  errors?: string[]
}

export function ClientDetailActions({ clientId, nip, hasProfile }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'fullAnalysis' | 'krs' | 'delete' | null>(null)
  const [, startTransition] = useTransition()

  // Sprint S6A Step 4 — Protocol 13 primary fundamental button.
  // Triggers FULL pipeline: Phase A (sync sources, ~10-30s) + Phase B
  // (async via after(), ~60-130s з AI_match_rescore). Returns Phase A
  // immediately; Phase B continues w tle, EnrichmentProgressBanner
  // (S6A Step 3) shows amber dashed status, page auto-refreshes when
  // Phase B done.
  async function fullAnalysis() {
    setBusy('fullAnalysis')
    const toastId = toast.loading('Pobieranie danych...')
    try {
      const res = await fetch(`/api/clients/${clientId}/full-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = (await res.json()) as FullAnalysisResponse
      if (!json.ok) {
        toast.error(json.error ?? 'Analiza nie powiodła się', { id: toastId })
        return
      }
      const pendingCount = json.response?.phase_b_pending?.length ?? 0
      const completedCount = json.response?.sources_completed?.length ?? 0
      toast.success(
        pendingCount > 0
          ? `Phase A gotowa (${completedCount} źródeł). Analiza AI w tle (~60-90s, ${pendingCount} pending)...`
          : `Phase A gotowa (${completedCount} źródeł).`,
        { id: toastId, duration: 6000 },
      )
      // router.refresh() щоб <EnrichmentProgressBanner> підхопив running
      // sources з enrichment_log та показав S5D amber dashed indicator.
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Błąd sieci', { id: toastId })
    } finally {
      setBusy(null)
    }
  }

  // Sprint S6A Step 4 — KRS-only refresh (formerly "Pobierz z KRS").
  // Wired до istniejącego /api/clients/[id]/krs-refresh (S5B-1).
  // Distinct od primary "Analiza klienta" — odświeża tylko KRS bez
  // odpalania całego pipeline'u Phase B.
  async function refreshKrsOnly() {
    if (!nip) {
      toast.error('Brak NIP — nie można pobrać z KRS')
      return
    }
    setBusy('krs')
    const toastId = toast.loading('Aktualizuję dane z KRS...')
    try {
      const res = await fetch(`/api/clients/${clientId}/krs-refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = (await res.json()) as KrsRefreshResponse
      if (!json.ok) {
        toast.error(json.error ?? 'Refresh nie powiódł się', { id: toastId })
        return
      }
      const parts: string[] = []
      if (json.fields_updated) parts.push(`${json.fields_updated} pól`)
      if (json.sprawozdania_added) parts.push(`${json.sprawozdania_added} sprawozdań`)
      const msg =
        parts.length > 0
          ? `Zaktualizowano: ${parts.join(', ')}`
          : 'Brak nowych danych z KRS'
      if (json.errors && json.errors.length > 0) {
        toast.warning(`${msg} (${json.errors.length} ostrzeżeń)`, { id: toastId })
      } else {
        toast.success(msg, { id: toastId })
      }
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Błąd sieci', { id: toastId })
    } finally {
      setBusy(null)
    }
  }

  function deleteClient() {
    if (!confirm('Czy na pewno usunąć tego klienta? Operacja nieodwracalna.')) return
    setBusy('delete')
    startTransition(async () => {
      const result = await deleteClientRecord(clientId)
      if (!result.ok) {
        alert(result.error ?? 'Usuwanie nie powiodło się')
        setBusy(null)
        return
      }
      router.push('/clients')
    })
  }

  return (
    <ActionBar
      primary={{
        label: hasProfile ? 'Pełna re-analiza' : 'Analiza klienta',
        icon: hasProfile ? <RefreshCwIcon className="size-3.5" /> : <SparklesIcon className="size-3.5" />,
        onClick: fullAnalysis,
        loading: busy === 'fullAnalysis',
        disabled: busy !== null,
        variant: hasProfile ? 'secondary' : 'primary',
        title: hasProfile
          ? 'Pełna re-analiza — wszystkie źródła + AI re-score'
          : 'Pobierz wszystkie źródła + AI analiza biznesowa + AI re-score TOP-10',
      }}
      actions={[
        {
          label: '+ Zadanie',
          href: `/tasks?client_id=${clientId}&new=1`,
          disabled: busy !== null,
        },
        {
          label: '+ Notatka',
          href: `/clients/${clientId}#aktywnosc`,
          disabled: busy !== null,
        },
        {
          label: '+ Szansa',
          href: `/deals/new?client_id=${clientId}`,
          disabled: busy !== null,
        },
      ]}
      menu={[
        {
          label: 'Edytuj',
          icon: <PencilIcon className="size-3.5" />,
          href: `/clients/${clientId}/edit`,
        },
        {
          label: 'Eksport (Markdown)',
          icon: <DownloadIcon className="size-3.5" />,
          href: `/api/clients/${clientId}/export-markdown`,
        },
        {
          label: busy === 'krs' ? 'Pobieranie KRS…' : 'Refresh KRS only',
          icon: <RefreshCcwIcon className="size-3.5" />,
          onClick: refreshKrsOnly,
          disabled: busy !== null || !nip,
        },
        {
          label: 'Usuń',
          icon: <Trash2Icon className="size-3.5" />,
          onClick: deleteClient,
          disabled: busy !== null,
          variant: 'destructive',
          separatorBefore: true,
        },
      ]}
    />
  )
}
