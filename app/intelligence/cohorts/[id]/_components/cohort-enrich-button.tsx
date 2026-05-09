'use client'

// app/intelligence/cohorts/[id]/_components/cohort-enrich-button.tsx
// Phase 2 Krok 1.E (09.05.2026) — UI trigger для bulk Apify Google Maps
// enrichment усієї cohort. SYNC pattern — frontend awaits POST response,
// shows summary alert (matches /matches bulk Apify convention).
//
// Disabled state коли eligibleCount = 0.
// Confirm dialog показує REAL cost estimate ($0.021/NIP per Vadym Q4).
// Hard cap 50 enforced server-side з 400 + PL message → toast.error.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { SparklesIcon, Loader2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'

const COST_PER_NIP_USD = 0.021

interface ApifyBatchSummary {
  unique_nips_attempted: number
  rows_inserted: number
  successful_nips: number
  partial_nips: number
  no_match_nips: number
  error_nips: number
  skipped_already_enriched_nips: number
  total_cost_usd: number
  duration_ms: number
}

interface Props {
  cohortId: string
  /** Pre-computed unique-NIP count (server-side via buildCohortBatchPlan).
   *  Client uses for UI label + cost estimate confirm dialog. */
  eligibleCount: number
}

export function CohortEnrichButton({ cohortId, eligibleCount }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  const disabled = eligibleCount === 0 || busy || pending
  const estimatedCost = (eligibleCount * COST_PER_NIP_USD).toFixed(2)

  const handleClick = () => {
    if (disabled) return

    const confirmed = confirm(
      `Wzbogacić ${eligibleCount} ${
        eligibleCount === 1 ? 'firmę' : 'firm'
      } через Apify Google Maps?\n\n` +
        `Estimated coszt: ~$${estimatedCost} (~$${COST_PER_NIP_USD}/NIP, max 3 results).\n` +
        `Czas: ~${Math.ceil(eligibleCount * 0.07)} min (avg 4s/NIP).\n\n` +
        `Pre-flight skip: członkowie що już mają contact data nie будуть billing'ані.`,
    )
    if (!confirmed) return

    setBusy(true)
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/cohorts/${cohortId}/bulk-enrich-apify`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dry_run: false }),
          },
        )
        const json = (await res.json()) as {
          ok: boolean
          error?: string
          summary?: ApifyBatchSummary
          plan?: { unique_nips: number; skipped_no_nip: number }
        }

        if (!json.ok) {
          toast.error(json.error ?? 'Apify batch failed')
          return
        }

        const s = json.summary
        if (!s) {
          toast.error('Brak summary у response — sprawdź /admin/health')
          return
        }

        const successMsg =
          `Apify enrichment ✓\n` +
          `Unique NIPs: ${s.unique_nips_attempted}\n` +
          `Successful: ${s.successful_nips} | Partial: ${s.partial_nips}\n` +
          `No match: ${s.no_match_nips} | Errors: ${s.error_nips}\n` +
          `Skipped (already enriched): ${s.skipped_already_enriched_nips}\n` +
          `Rows inserted: ${s.rows_inserted}\n` +
          `Cost: $${s.total_cost_usd.toFixed(4)}\n` +
          `Duration: ${(s.duration_ms / 1000).toFixed(1)}s`

        // alert is OK для multi-line summary — toast.success обмежений
        // single-line у sonner default config.
        alert(successMsg)
        toast.success(
          `Wzbogacono ${s.successful_nips + s.partial_nips}/${s.unique_nips_attempted} firm`,
        )
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error(`Błąd sieci: ${msg}`)
      } finally {
        setBusy(false)
      }
    })
  }

  if (eligibleCount === 0) {
    return (
      <Button variant="outline" size="sm" disabled title="Brak członków з NIP">
        <SparklesIcon className="mr-1 size-3.5" />
        Wzbogać Apify (0)
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      title={`~$${estimatedCost} | ~${Math.ceil(eligibleCount * 0.07)} min`}
    >
      {busy || pending ? (
        <Loader2Icon className="mr-1 size-3.5 animate-spin" />
      ) : (
        <SparklesIcon className="mr-1 size-3.5" />
      )}
      {busy || pending
        ? `Wzbogacanie ${eligibleCount}…`
        : `Wzbogać Apify (${eligibleCount})`}
    </Button>
  )
}
