// components/matches/matches-panel.tsx
// Read-only TOP-N matches view. Modes:
//   • mode='product-side'   — keyed by client_id OR prospect_id;
//                              shows products on right
//   • mode='target-side'    — keyed by product_id;
//                              shows clients/prospects з target_type badge

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2Icon, RefreshCwIcon, SparklesIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MatchEntry {
  id: string
  client_id: string | null
  prospect_id: string | null
  product_id: string
  algo_score: number
  ai_score: number | null
  ai_reasoning: string | null
  ai_confidence: number | null
  ai_scored_at: string | null
  combined_score: number
  subscore_breakdown: { pkd: number; activity: number; size: number; geo: number; recency: number }
  reason_codes: string[]
  loyalty_multiplier: number
  computed_at: string
  expires_at: string
  product?: { name?: string; brand?: string; gramatura?: string } | null
  target?: { title?: string; name?: string; nip?: string; region?: string; wojewodztwo?: string } | null
  target_type?: 'client' | 'prospect'
}

interface Props {
  mode: 'product-side' | 'target-side'
  /** UUID of client/prospect (mode=product-side) or product (mode=target-side) */
  keyType: 'client_id' | 'prospect_id' | 'product_id'
  keyValue: string
  recomputePath?: string // e.g. /api/admin/matching/recompute-client
  limit?: number
  title?: string
}

export function MatchesPanel({ mode, keyType, keyValue, recomputePath, limit = 20, title }: Props) {
  const [data, setData] = useState<MatchEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchMatches() {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/matches?${keyType}=${encodeURIComponent(keyValue)}&limit=${limit}`
      const res = await fetch(url)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Błąd ładowania')
      setData((json.data ?? []) as MatchEntry[])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleRecompute() {
    if (!recomputePath) return
    setRecomputing(true)
    setError(null)
    try {
      const res = await fetch(`${recomputePath}?id=${encodeURIComponent(keyValue)}`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Recompute nieudane')
      await fetchMatches()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRecomputing(false)
    }
  }

  useEffect(() => {
    fetchMatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyValue])

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-5 text-amber-600" />
          {title ?? 'Dopasowane'}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            TOP-{limit}, sortowane od najwyższego score
          </span>
        </CardTitle>
        {recomputePath && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRecompute}
            disabled={recomputing}
          >
            {recomputing ? (
              <Loader2Icon className="size-4 mr-1 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-4 mr-1" />
            )}
            {recomputing ? 'Przeliczanie…' : 'Przelicz teraz'}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">
            <Loader2Icon className="size-4 inline animate-spin" /> Ładowanie matches…
          </p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak dopasowań. Kliknij &quot;Przelicz teraz&quot; aby uruchomić scoring.
          </p>
        ) : (
          <ul className="divide-y">
            {data.map((m) => (
              <MatchRow key={m.id} match={m} mode={mode} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function MatchRow({ match, mode }: { match: MatchEntry; mode: 'product-side' | 'target-side' }) {
  const score = match.combined_score ?? match.algo_score
  const hasAi = match.ai_score !== null
  const scoreColor =
    score >= 70
      ? 'bg-green-600'
      : score >= 50
        ? 'bg-amber-500'
        : score >= 30
          ? 'bg-orange-500'
          : 'bg-gray-400'

  const displayName =
    mode === 'product-side'
      ? match.product?.name ?? '—'
      : match.target?.title ?? match.target?.name ?? '—'
  const displaySub =
    mode === 'product-side'
      ? [match.product?.brand, match.product?.gramatura].filter(Boolean).join(' · ')
      : [
          match.target?.region ?? match.target?.wojewodztwo,
          match.target?.nip,
        ]
          .filter(Boolean)
          .join(' · ')

  return (
    <li className="flex items-start gap-3 py-3">
      {/* Score badge */}
      <div
        className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-white text-sm font-bold relative', scoreColor)}
        title={hasAi ? `AI: ${match.ai_score} (algo: ${match.algo_score}, conf: ${match.ai_confidence ?? 0})\n${match.ai_reasoning ?? ''}` : `Algo only`}
      >
        {score}
        {hasAi && (
          <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-purple-600 border border-white text-[8px] flex items-center justify-center text-white font-bold">
            AI
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{displayName}</span>
          {mode === 'target-side' && match.target_type && (
            <Badge
              className={cn(
                'h-5 text-[10px]',
                match.target_type === 'client' ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white',
              )}
            >
              {match.target_type === 'client' ? 'Klient' : 'Prospekt'}
            </Badge>
          )}
        </div>
        {displaySub && (
          <p className="text-xs text-muted-foreground truncate">{displaySub}</p>
        )}
        {hasAi && match.ai_reasoning && (
          <p className="text-xs text-muted-foreground italic line-clamp-2">
            🤖 {match.ai_reasoning}
          </p>
        )}
        <div className="flex flex-wrap gap-1 pt-1">
          {match.reason_codes.map((r, idx) => (
            <Badge
              key={`${match.id}-${idx}`}
              variant="outline"
              className="text-[10px] font-mono font-normal"
            >
              {r}
            </Badge>
          ))}
        </div>
        {/* Score progress bar */}
        <div className="h-1 w-full overflow-hidden rounded bg-muted">
          <div className={cn('h-full', scoreColor)} style={{ width: `${score}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>
            pkd:{match.subscore_breakdown.pkd} · act:{match.subscore_breakdown.activity} ·
            size:{match.subscore_breakdown.size} · geo:{match.subscore_breakdown.geo} ·
            rec:{match.subscore_breakdown.recency}
          </span>
          {match.loyalty_multiplier !== 1 && (
            <span className="font-medium">×{match.loyalty_multiplier} loyalty</span>
          )}
        </div>
      </div>
    </li>
  )
}
