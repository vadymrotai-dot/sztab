'use client'

// components/clients/bulk-action-bar.tsx
// Sprint S4 Phase 2B — sticky dark bulk action bar для /clients.
// Shows when ≥1 row selected. Replaces "Akcje grupowe" dropdown.
// Primary "✨ Analizuj AI (N)" + secondary actions + Anuluj close.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SparklesIcon, BriefcaseIcon, RefreshCcwIcon, TagIcon, XIcon, Loader2Icon } from 'lucide-react'

interface Props {
  selectedIds: string[]
  onClear: () => void
}

export function BulkActionBar({ selectedIds, onClear }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'analyze' | 'cohort' | 'refresh' | 'tag' | null>(null)
  const n = selectedIds.length

  async function bulkAnalyze() {
    if (
      !confirm(
        `Analizuj AI dla ${n} firm? Operacja zsekwencyjna, ~30-60s na firmę. Cap 5 за wykonanie.`,
      )
    )
      return
    setBusy('analyze')
    try {
      const res = await fetch('/api/clients/bulk-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const json = (await res.json()) as {
        ok: boolean
        succeeded?: number
        failed?: number
        error?: string
      }
      if (json.ok) {
        alert(
          `Analiza zakończona: ${json.succeeded ?? 0} OK, ${json.failed ?? 0} błędów.${
            n > 5 ? ` (Cap 5 — ${n - 5} pominiętych)` : ''
          }`,
        )
        router.refresh()
        onClear()
      } else {
        alert(json.error ?? 'Błąd bulk-analyze')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  async function exportCohort() {
    const name = prompt(
      `Eksport ${n} firm jako kohorta. Podaj nazwę:`,
      `Manualna kohorta ${new Date().toISOString().slice(0, 10)}`,
    )
    if (!name) return
    setBusy('cohort')
    try {
      const res = await fetch('/api/handoff/cohort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohort_name: name,
          entity_ids: selectedIds,
          source: 'manual_select',
        }),
      })
      const json = (await res.json()) as { ok: boolean; redirect?: string; error?: string }
      if (json.ok && json.redirect) {
        router.push(json.redirect)
        onClear()
      } else {
        alert(json.error ?? 'Błąd eksportu')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  async function bulkRefresh() {
    if (!confirm(`Odświeżyć z KRS dla ${n} firm? (Cap 5 за wykonanie)`)) return
    setBusy('refresh')
    try {
      const res = await fetch('/api/clients/bulk-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const json = (await res.json()) as {
        ok: boolean
        succeeded?: number
        failed?: number
        skipped?: number
        error?: string
      }
      if (json.ok) {
        alert(
          `Odświeżanie: ${json.succeeded ?? 0} OK, ${json.failed ?? 0} błędów, ${
            json.skipped ?? 0
          } pominiętych.`,
        )
        router.refresh()
        onClear()
      } else {
        alert(json.error ?? 'Błąd bulk-refresh')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  async function bulkTag() {
    const value = prompt('Tier для wybranych firm (mały/średni/duży/strategic_partner):')
    if (!value) return
    setBusy('tag')
    try {
      const res = await fetch('/api/clients/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, field: 'size_tier', value }),
      })
      const json = (await res.json()) as { ok: boolean; updated?: number; error?: string }
      if (json.ok) {
        alert(`Otagowano ${json.updated ?? n} firm`)
        router.refresh()
        onClear()
      } else {
        alert(json.error ?? 'Błąd tagowania')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="sticky bottom-0 left-0 right-0 z-30 border-t border-[#0A0A0A] bg-[#15151A] text-white shadow-[0_-4px_12px_rgba(0,0,0,0.15)]">
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <span className="text-sm font-medium">
          Wybrano <span className="text-[#A5B4FC]">{n}</span> firm
        </span>
        <div className="ml-2 h-6 w-px bg-white/15" />

        <button
          type="button"
          onClick={bulkAnalyze}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#4F46E5] px-3 py-1.5 text-sm font-medium hover:bg-[#4338CA] disabled:opacity-50"
        >
          {busy === 'analyze' ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <SparklesIcon className="size-3.5" />
          )}
          Analizuj AI ({n})
        </button>

        <button
          type="button"
          onClick={exportCohort}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
        >
          {busy === 'cohort' ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <BriefcaseIcon className="size-3.5" />
          )}
          Eksport jako kohorta
        </button>

        <button
          type="button"
          onClick={bulkRefresh}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
        >
          {busy === 'refresh' ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <RefreshCcwIcon className="size-3.5" />
          )}
          Odśwież z KRS
        </button>

        <button
          type="button"
          onClick={bulkTag}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
        >
          {busy === 'tag' ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <TagIcon className="size-3.5" />
          )}
          + Tag
        </button>

        <button
          type="button"
          onClick={onClear}
          disabled={busy !== null}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <XIcon className="size-3.5" />
          Anuluj
        </button>
      </div>
    </div>
  )
}
