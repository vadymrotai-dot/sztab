'use client'

// components/cohort/score-histogram.tsx
// Sprint S-UX-CORE STEP 3.2 (14.05.2026) — score distribution banner above
// cohort prospekti DataTable. 4 tiers (≥70 / 50-69 / <50 / —), click chip
// applies column filter on `score` column.
//
// Visual: 4 inline chips з кольоровим background per tier + mini bar (width
// proportional до count). Active tier highlighted з darker background +
// pill clear button "× Wszystkie".
//
// Triggers column filter on score column — DataTable filterFn handles
// matching. Filter value: 'high' | 'mid' | 'low' | 'none'.
//
// Polish text per Vadym spec:
//   ">=70 Hot" / "50-69 Mid" / "<50 Skip" / "— Brak"

import * as React from 'react'
import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ScoreTier = 'high' | 'mid' | 'low' | 'none'

interface TierDef {
  id: ScoreTier
  label: string
  shortLabel: string
  match: (score: number | null) => boolean
  /** Resting style (inactive). */
  resting: string
  /** Active (filter applied) style. */
  active: string
  /** Bar fill color (used inside chip). */
  bar: string
}

const TIERS: TierDef[] = [
  {
    id: 'high',
    label: '≥70 Hot',
    shortLabel: '≥70',
    match: (s) => s !== null && s >= 70,
    resting: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    active: 'border-emerald-500 bg-emerald-100 text-emerald-900 ring-2 ring-emerald-300',
    bar: 'bg-emerald-300/70',
  },
  {
    id: 'mid',
    label: '50-69 Mid',
    shortLabel: '50-69',
    match: (s) => s !== null && s >= 50 && s < 70,
    resting: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
    active: 'border-amber-500 bg-amber-100 text-amber-900 ring-2 ring-amber-300',
    bar: 'bg-amber-300/70',
  },
  {
    id: 'low',
    label: '<50 Skip',
    shortLabel: '<50',
    match: (s) => s !== null && s > 0 && s < 50,
    resting: 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100',
    active: 'border-gray-500 bg-gray-200 text-gray-900 ring-2 ring-gray-300',
    bar: 'bg-gray-300/70',
  },
  {
    id: 'none',
    label: '— Brak',
    shortLabel: '—',
    match: (s) => s === null || s <= 0,
    resting: 'border-dashed border-muted-foreground/30 bg-muted/30 text-muted-foreground hover:bg-muted/50',
    active: 'border-dashed border-foreground/50 bg-muted text-foreground ring-2 ring-muted-foreground/40',
    bar: 'bg-muted-foreground/30',
  },
]

interface ScoreHistogramProps {
  /** Pre-computed effective score per prospect. null → "no score" tier. */
  scores: (number | null)[]
  /** Currently active tier filter (read з columnFilters). */
  activeTier: ScoreTier | null
  /** Callback when chip clicked. Pass null to clear filter. */
  onChange: (tier: ScoreTier | null) => void
  className?: string
}

export function ScoreHistogram({
  scores,
  activeTier,
  onChange,
  className,
}: ScoreHistogramProps) {
  const counts = React.useMemo(() => {
    const out: Record<ScoreTier, number> = { high: 0, mid: 0, low: 0, none: 0 }
    for (const s of scores) {
      for (const tier of TIERS) {
        if (tier.match(s)) {
          out[tier.id] += 1
          break
        }
      }
    }
    return out
  }, [scores])

  const total = scores.length
  const maxCount = Math.max(1, ...Object.values(counts))

  if (total === 0) return null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs',
        className,
      )}
      role="group"
      aria-label="Rozkład score prospektów"
    >
      <span className="font-medium text-muted-foreground">Rozkład score:</span>

      {TIERS.map((tier) => {
        const count = counts[tier.id]
        const isActive = activeTier === tier.id
        const widthPct = Math.round((count / maxCount) * 100)
        const isClickable = count > 0
        return (
          <button
            key={tier.id}
            type="button"
            disabled={!isClickable}
            onClick={() => onChange(isActive ? null : tier.id)}
            aria-pressed={isActive}
            aria-label={`Filtruj: ${tier.label} (${count} prospektów)`}
            className={cn(
              'relative flex items-center gap-1.5 overflow-hidden rounded-md border px-2.5 py-1 transition',
              isActive ? tier.active : tier.resting,
              !isClickable && 'cursor-not-allowed opacity-50 hover:bg-transparent',
            )}
          >
            {/* Background bar — width proportional do count */}
            {count > 0 && (
              <span
                aria-hidden
                className={cn('absolute inset-y-0 left-0 -z-10 transition-all', tier.bar)}
                style={{ width: `${widthPct}%` }}
              />
            )}
            <span className="relative font-medium tabular-nums">
              {tier.shortLabel}: {count}
            </span>
          </button>
        )
      })}

      {activeTier !== null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
          className="ml-auto h-7 gap-1 text-xs"
          aria-label="Wyczyść filtr score"
        >
          <XIcon className="size-3" />
          Wszystkie
        </Button>
      )}
    </div>
  )
}

// ─── Helper: tier filter fn для TanStack column ────────────────────
// Use як filterFn у column def:
//   { id: 'score', filterFn: scoreTierFilterFn, ... }
// Filter value: ScoreTier string. Cell value: number (-1 для "no score").
//
// FIX #1 (14.05.2026) — generic function замість `FilterFn<unknown>` const.
// TanStack column expects `FilterFn<TData>` де TData = exact row type.
// Generic function lets TS infer TData from column context (e.g.
// ProspectMemberRow з cohort-members-client.tsx). Plain function з 3 params
// satisfies callable signature; optional `resolveFilterValue/autoRemove`
// props default до undefined → FilterFn<TData> structural match.

import type { Row } from '@tanstack/react-table'

export function scoreTierFilterFn<TData>(
  row: Row<TData>,
  columnId: string,
  filterValue: unknown,
): boolean {
  if (!filterValue) return true
  const raw = row.getValue(columnId) as unknown
  const v = typeof raw === 'number' ? raw : Number(raw)
  // -1 / NaN / 0 → "none" tier (matches getProspectScore null fallback).
  const score = Number.isFinite(v) && v > 0 ? v : null
  const tier = TIERS.find((t) => t.id === filterValue)
  if (!tier) return true
  return tier.match(score)
}

// ─── Helper: derive effective score for prospect ────────────────────
// Mirrors cohort-members-client.tsx score column accessorFn priority:
//   1. match.max_score
//   2. horeca_meta_score
//   3. gmaps_rating × 20
//   4. null

interface ScoreSources {
  match?: { max_score: number | null } | null
  snapshot?: { horeca_meta_score: number | string | null } | null
  enrichment?: { gmaps_rating: number | string | null } | null
}

export function getProspectEffectiveScore(row: ScoreSources): number | null {
  const ms = row.match?.max_score
  if (typeof ms === 'number' && ms > 0) return ms
  const metaRaw = row.snapshot?.horeca_meta_score
  const meta =
    typeof metaRaw === 'number'
      ? metaRaw
      : metaRaw != null && metaRaw !== ''
        ? parseFloat(String(metaRaw))
        : NaN
  if (Number.isFinite(meta) && meta > 0) return meta
  const gRaw = row.enrichment?.gmaps_rating
  const g =
    typeof gRaw === 'number'
      ? gRaw
      : gRaw != null && gRaw !== ''
        ? parseFloat(String(gRaw))
        : NaN
  if (Number.isFinite(g) && g > 0) return g * 20
  return null
}
