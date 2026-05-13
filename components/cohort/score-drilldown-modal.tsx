'use client'

// components/cohort/score-drilldown-modal.tsx
// Sprint S-UX-CORE STEP 3.3 (14.05.2026) — full score breakdown modal.
// Trigger: click на MatchScoreBadge у cohort prospects table → opens
// shadcn Dialog з 3 sections:
//   1. Algorithmic (L5) — base.pkd/size/geo/recency/aktywność/niche
//      + bonuses (ua_founder_boost, revenue, branches) + penalties.
//   2. AI re-score (L6) — buyer_strength_for_chm + cap status (fired/skipped).
//   3. False positive heuristic — 3 banners (⚠ risk / ✅ confidence / ℹ info)
//      базуючись на combined_score + buyer_strength + reason_codes.
//
// Data sources (passed via props, no fetch у component — page.tsx server
// fetch уже включає всі fields):
//   - prospect.snapshot.business_profile.buyer_strength_for_chm
//   - prospect.match.{max_score, top_algo_score, top_ai_score, top_reason_codes, breakdown}
//
// Accessibility:
//   - shadcn Dialog handles Esc + click outside + focus trap (Radix UI)
//   - DialogTitle/DialogDescription = labelled by screen readers
//   - Action buttons keyboard-reachable
//
// Mobile: max-w-2xl + max-h-[85vh] overflow-y-auto = scrollable on small screens.

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon, ExternalLinkIcon } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { ProspectMemberRow } from '@/app/intelligence/cohorts/[id]/_components/cohort-members-client'

// ─── Types ────────────────────────────────────────────────────────

interface ScoreBreakdown {
  total?: number
  base?: Partial<
    Record<'pkd' | 'activity' | 'size' | 'geo' | 'recency' | 'niche', number>
  >
  bonuses?: Record<string, number>
  penalties?: Record<string, number>
  reasons?: string[]
}

interface DrilldownModalProps {
  /** Prospect row з match data. null → modal closed. */
  prospect: ProspectMemberRow | null
  onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Detect "buyer_strength_cap:<value>" reason code → return cap value, or null. */
function parseStrengthCap(reasonCodes: string[]): number | null {
  for (const code of reasonCodes) {
    const m = /^buyer_strength_cap:(\d+)$/.exec(code)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

const PKD_LABELS: Record<string, string> = {
  pkd: 'PKD fit',
  activity: 'Aktywność',
  size: 'Rozmiar',
  geo: 'Geografia',
  recency: 'Świeżość',
  niche: 'Niche bonus',
}

// ─── Component ────────────────────────────────────────────────────

export function ScoreDrilldownModal({ prospect, onClose }: DrilldownModalProps) {
  const open = prospect !== null

  // Bail rendering work якщо closed (avoid recomputing for null).
  if (!prospect) {
    return (
      <Dialog open={false} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sr-only" />
      </Dialog>
    )
  }

  const match = prospect.match
  const snap = prospect.snapshot
  const breakdown = (match?.breakdown && typeof match.breakdown === 'object'
    ? match.breakdown
    : null) as ScoreBreakdown | null
  const base = breakdown?.base ?? {}
  const bonuses = breakdown?.bonuses ?? {}
  const penalties = breakdown?.penalties ?? {}
  const reasonCodes = match?.top_reason_codes ?? []

  const combinedScore = match?.max_score ?? null
  const algoScore = match?.top_algo_score ?? null
  const aiScore = match?.top_ai_score ?? null
  const strength = snap?.business_profile?.buyer_strength_for_chm ?? null
  const capValue = parseStrengthCap(reasonCodes)
  const capFired = capValue !== null

  // False positive heuristic
  // Risk: combined ≥70 AND strength <60 AND no cap fired → ⚠ warning
  // Confidence: combined ≥70 AND strength ≥70 → ✅
  // Info: brakuje strength → ℹ "AI dane niedostępne"
  let riskLevel: 'warning' | 'confidence' | 'info' | 'neutral' = 'neutral'
  let riskMessage = ''
  if (combinedScore !== null && combinedScore >= 70) {
    if (strength === null || strength === undefined) {
      riskLevel = 'info'
      riskMessage =
        'Brak danych AI buyer_strength — score wyłącznie z algorytmu (L5). Rekomendacja: uruchom analizę AI przed dzwonkiem.'
    } else if (strength < 60 && !capFired) {
      riskLevel = 'warning'
      riskMessage =
        'AI ocena siły kupującego niska (<60) ale algo dał wysoki score. Cap nie zadziałał (próg <30). Możliwe false positive — zalecana manualna weryfikacja przed kontaktem.'
    } else if (strength >= 70) {
      riskLevel = 'confidence'
      riskMessage =
        'Wysoka pewność dopasowania: algorytm i AI obie wskazują dobry fit. Można dzwonić.'
    }
  }

  const algoSubtotal =
    (base.pkd ?? 0) +
    (base.activity ?? 0) +
    (base.size ?? 0) +
    (base.geo ?? 0) +
    (base.recency ?? 0) +
    (base.niche ?? 0)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{snap?.name ?? 'Prospekt'}</span>
            <Badge
              variant="outline"
              className={cn(
                'shrink-0 tabular-nums',
                combinedScore !== null && combinedScore >= 70
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : combinedScore !== null && combinedScore >= 50
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-gray-300 bg-gray-50 text-gray-700',
              )}
            >
              {combinedScore ?? '—'} / 100
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Szczegóły dopasowania matching engine. {match?.count ?? 0}{' '}
            {match?.count === 1 ? 'dopasowanie' : 'dopasowań'} produktowych.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ─── Algorithmic L5 ─── */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Algorithmic score (L5)
            </h3>
            <div className="rounded-md border bg-muted/20 p-3">
              <BreakdownLine label="Subtotal" value={algoSubtotal} highlight />
              <div className="my-2 border-t" />
              {(['pkd', 'size', 'geo', 'activity', 'recency', 'niche'] as const).map(
                (k) => {
                  const v = base[k]
                  if (v === undefined || v === 0) return null
                  return <BreakdownLine key={k} label={PKD_LABELS[k]} value={v} />
                },
              )}
              {Object.entries(bonuses).some(([, v]) => v > 0) && (
                <>
                  <div className="my-2 border-t" />
                  <div className="mb-1 text-[10px] font-medium uppercase text-emerald-700">
                    Bonusy
                  </div>
                  {Object.entries(bonuses).map(([k, v]) =>
                    v > 0 ? (
                      <BreakdownLine key={k} label={k} value={v} positive />
                    ) : null,
                  )}
                </>
              )}
              {Object.entries(penalties).some(([, v]) => v !== 0) && (
                <>
                  <div className="my-2 border-t" />
                  <div className="mb-1 text-[10px] font-medium uppercase text-rose-700">
                    Penalty
                  </div>
                  {Object.entries(penalties).map(([k, v]) =>
                    v !== 0 ? (
                      <BreakdownLine key={k} label={k} value={v} negative />
                    ) : null,
                  )}
                </>
              )}
              {algoScore !== null && (
                <>
                  <div className="my-2 border-t" />
                  <BreakdownLine label="Algo final" value={algoScore} highlight />
                </>
              )}
            </div>
          </section>

          {/* ─── AI re-score L6 ─── */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              AI re-score (L6)
            </h3>
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              {strength !== null && strength !== undefined ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">buyer_strength_for_chm:</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'tabular-nums',
                        strength >= 70
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : strength >= 30
                            ? 'border-amber-300 bg-amber-50 text-amber-800'
                            : 'border-rose-300 bg-rose-50 text-rose-800',
                      )}
                    >
                      {strength}{' '}
                      {strength >= 70
                        ? '(high)'
                        : strength >= 30
                          ? '(mid)'
                          : '(low)'}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Cap formula: jeśli buyer_strength &lt; 30 AND algo_score &gt;
                    strength → final = strength (anti-false-positive guard).
                  </div>
                  <div className="mt-1 text-xs">
                    Status:{' '}
                    {capFired ? (
                      <span className="font-medium text-rose-700">
                        ⚡ Cap zadziałał: {capValue}
                      </span>
                    ) : strength < 30 ? (
                      <span className="font-medium text-amber-700">
                        Strength &lt; 30 ale cap nie potrzebny (algo był ≤ strength).
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Cap nie zadziałał (potrzebuje strength &lt; 30).
                      </span>
                    )}
                  </div>
                  {aiScore !== null && (
                    <div className="mt-2">
                      <BreakdownLine label="AI override score" value={aiScore} />
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Brak danych business_profile. AI re-score nie został uruchomiony
                  для tego prospекta. Zaloguj się як admin i uruchom{' '}
                  <code className="rounded bg-muted px-1">bulk-ai-prospects.mjs</code>
                  {' '}для tej cohortі.
                </div>
              )}
            </div>
          </section>

          {/* ─── False positive heuristic banner ─── */}
          {riskLevel !== 'neutral' && (
            <section>
              <div
                className={cn(
                  'flex gap-2 rounded-md border p-3 text-sm',
                  riskLevel === 'warning' &&
                    'border-amber-300 bg-amber-50 text-amber-900',
                  riskLevel === 'confidence' &&
                    'border-emerald-300 bg-emerald-50 text-emerald-900',
                  riskLevel === 'info' && 'border-sky-300 bg-sky-50 text-sky-900',
                )}
              >
                {riskLevel === 'warning' && (
                  <AlertTriangleIcon className="size-5 shrink-0" />
                )}
                {riskLevel === 'confidence' && (
                  <CheckCircle2Icon className="size-5 shrink-0" />
                )}
                {riskLevel === 'info' && <InfoIcon className="size-5 shrink-0" />}
                <div className="space-y-1">
                  <div className="font-medium">
                    {riskLevel === 'warning' && '⚠ Ryzyko false positive'}
                    {riskLevel === 'confidence' && '✅ Wysoka pewność'}
                    {riskLevel === 'info' && 'ℹ Brak danych AI'}
                  </div>
                  <div className="text-xs">{riskMessage}</div>
                </div>
              </div>
            </section>
          )}

          {/* ─── Reason codes raw (debug, collapsed by default) ─── */}
          {reasonCodes.length > 0 && (
            <section>
              <details className="rounded-md border bg-muted/10 p-2 text-xs">
                <summary className="cursor-pointer font-medium text-muted-foreground">
                  Reason codes ({reasonCodes.length})
                </summary>
                <div className="mt-2 flex flex-wrap gap-1">
                  {reasonCodes.map((c) => (
                    <Badge
                      key={c}
                      variant="outline"
                      className="font-mono text-[10px]"
                    >
                      {c}
                    </Badge>
                  ))}
                </div>
              </details>
            </section>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {snap?.nip && (
              <span className="font-mono">NIP: {snap.nip}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {snap?.nip && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/intelligence/lookup?nip=${snap.nip}`} target="_blank">
                  <ExternalLinkIcon className="mr-1 size-3" />
                  Otwórz profil
                </Link>
              </Button>
            )}
            <Button variant="default" size="sm" onClick={onClose}>
              Zamknij
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── BreakdownLine ───────────────────────────────────────────────

function BreakdownLine({
  label,
  value,
  highlight = false,
  positive = false,
  negative = false,
}: {
  label: string
  value: number
  highlight?: boolean
  positive?: boolean
  negative?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-0.5 text-xs',
        highlight && 'font-semibold',
      )}
    >
      <span className={cn('text-muted-foreground', highlight && 'text-foreground')}>
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          positive && 'text-emerald-700',
          negative && 'text-rose-700',
        )}
      >
        {positive && value > 0 ? '+' : ''}
        {value}
      </span>
    </div>
  )
}
