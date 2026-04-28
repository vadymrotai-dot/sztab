// components/matches/matches-global-view.tsx
// Filterable cross-database TOP-N matches view.
// Defaults: target_type=all, min_score=50, limit=100.

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  product?: { name?: string; brand?: string } | null
  target?: { title?: string; name?: string; nip?: string; region?: string; wojewodztwo?: string } | null
  target_type: 'client' | 'prospect'
}

type FilterTargetType = 'all' | 'client' | 'prospect'

export function MatchesGlobalView() {
  const [data, setData] = useState<MatchEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)
  const [airescoring, setAirescoring] = useState(false)

  // Filters
  const [targetType, setTargetType] = useState<FilterTargetType>('all')
  const [minScore, setMinScore] = useState(50)
  const [limit, setLimit] = useState(100)
  const [aiOnly, setAiOnly] = useState(false)

  async function fetchMatches() {
    setLoading(true)
    setError(null)
    try {
      const url = new URL('/api/matches/global', window.location.origin)
      if (targetType !== 'all') url.searchParams.set('target_type', targetType)
      url.searchParams.set('min_score', String(minScore))
      url.searchParams.set('limit', String(limit))
      if (aiOnly) url.searchParams.set('ai_only', 'true')
      const res = await fetch(url.toString())
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Błąd ładowania')
      setData((json.data ?? []) as MatchEntry[])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleBulk() {
    setRecomputing(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/matching/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!json.ok && json.summary?.errors?.length > 0) {
        setError(`Bulk завершено з błędami: ${json.summary.errors.join('; ')}`)
      }
      await fetchMatches()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRecomputing(false)
    }
  }

  async function handleAiBulk() {
    setAirescoring(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/matching/ai-rescore-bulk', {
        method: 'POST',
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error ?? 'AI bulk failed')
      } else if (json.result?.aborted_cost_guard) {
        setError(`Cost guard aborted po $${json.result.total_cost_usd}`)
      }
      await fetchMatches()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAirescoring(false)
    }
  }

  useEffect(() => {
    fetchMatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, minScore, limit, aiOnly])

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="space-y-1">
            <Label className="text-xs">Typ celu</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as FilterTargetType)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystko</SelectItem>
                <SelectItem value="client">Tylko klienci</SelectItem>
                <SelectItem value="prospect">Tylko prospekci</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Min score</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => setMinScore(Math.min(Math.max(parseInt(e.target.value) || 0, 0), 100))}
              className="w-24"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Limit</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 500))}
              className="w-24"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <input
                type="checkbox"
                checked={aiOnly}
                onChange={(e) => setAiOnly(e.target.checked)}
                className="size-3"
              />
              tylko AI-rescored
            </Label>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchMatches} disabled={loading}>
              <RefreshCwIcon className="size-4 mr-1" />
              Odśwież
            </Button>
            <Button onClick={handleBulk} disabled={recomputing || airescoring} variant="outline" size="sm">
              {recomputing ? (
                <Loader2Icon className="size-4 mr-1 animate-spin" />
              ) : (
                <SparklesIcon className="size-4 mr-1" />
              )}
              {recomputing ? 'L5 algo…' : 'L5 algo bulk'}
            </Button>
            <Button onClick={handleAiBulk} disabled={airescoring || recomputing} size="sm">
              {airescoring ? (
                <Loader2Icon className="size-4 mr-1 animate-spin" />
              ) : (
                <SparklesIcon className="size-4 mr-1" />
              )}
              {airescoring ? 'L6 AI…' : 'L6 AI bulk re-score'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? 'Ładowanie…' : `${data.length} dopasowań`}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (sortowanie: score DESC)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 text-sm text-red-600">{error}</p>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">
              <Loader2Icon className="size-4 inline animate-spin" /> Ładowanie…
            </p>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak dopasowań zgodnych z filtrami. Kliknij &quot;Bulk recompute&quot; aby uruchomić scoring.
            </p>
          ) : (
            <ul className="divide-y">
              {data.map((m, idx) => (
                <GlobalMatchRow key={m.id} match={m} rank={idx + 1} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function GlobalMatchRow({ match, rank }: { match: MatchEntry; rank: number }) {
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

  const targetName = match.target?.title ?? match.target?.name ?? '—'
  const targetSub = [
    match.target?.region ?? match.target?.wojewodztwo,
    match.target?.nip,
  ]
    .filter(Boolean)
    .join(' · ')

  const targetHref =
    match.target_type === 'client' && match.client_id
      ? `/clients/${match.client_id}`
      : match.target_type === 'prospect'
        ? `/intelligence/prospects` // panel-based, не deep link
        : '#'
  const productHref = `/products/${match.product_id}/edit`

  return (
    <li className="grid grid-cols-12 items-start gap-2 py-3">
      <div className="col-span-1 text-xs font-mono text-muted-foreground pt-1">
        #{rank}
      </div>
      <div
        className={cn('col-span-1 flex h-12 w-12 items-center justify-center rounded-md text-white text-sm font-bold relative', scoreColor)}
        title={hasAi ? `AI: ${match.ai_score} (algo: ${match.algo_score}, conf: ${match.ai_confidence ?? 0})\n${match.ai_reasoning ?? ''}` : 'Algo only'}
      >
        {score}
        {hasAi && (
          <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-purple-600 border border-white text-[8px] flex items-center justify-center text-white font-bold">
            AI
          </span>
        )}
      </div>
      <div className="col-span-5 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={cn(
              'h-5 text-[10px]',
              match.target_type === 'client' ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white',
            )}
          >
            {match.target_type === 'client' ? 'Klient' : 'Prospekt'}
          </Badge>
          <Link href={targetHref} className="font-medium truncate hover:underline">
            {targetName}
          </Link>
        </div>
        {targetSub && <p className="text-xs text-muted-foreground truncate">{targetSub}</p>}
      </div>
      <div className="col-span-5 min-w-0 space-y-1">
        <Link href={productHref} className="text-sm font-medium hover:underline">
          {match.product?.name ?? '—'}
        </Link>
        <p className="text-xs text-muted-foreground truncate">
          {match.product?.brand ?? ''}
        </p>
        <div className="flex flex-wrap gap-1 pt-1">
          {match.reason_codes.slice(0, 4).map((r, idx) => (
            <Badge key={`${match.id}-${idx}`} variant="outline" className="text-[10px] font-mono font-normal">
              {r}
            </Badge>
          ))}
          {match.reason_codes.length > 4 && (
            <span className="text-[10px] text-muted-foreground">+{match.reason_codes.length - 4}</span>
          )}
        </div>
      </div>
    </li>
  )
}
