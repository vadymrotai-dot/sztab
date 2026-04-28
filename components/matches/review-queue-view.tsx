// components/matches/review-queue-view.tsx
// Sprint I — Layer 2 manual review queue для pre-Apify approval.

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  CheckIcon,
  XIcon,
  RefreshCwIcon,
  Loader2Icon,
  ZapIcon,
  Link2Icon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface QueueItem {
  match_id: string
  target_type: 'client' | 'prospect'
  target_id: string
  target_name: string
  nip: string
  pkd: string[]
  city: string
  combined_score: number
  algo_score: number
  ai_score: number | null
  ai_reasoning: string | null
  reason_codes: string[]
  product_name: string
  product_brand: string | null
  also_in_other_table: boolean
  apify_review_status: 'pending' | 'approved' | 'skipped'
  apify_reviewed_at: string | null
  apify_reviewed_by: string | null
  existing_contact: {
    phone: string | null
    email: string | null
    website: string | null
    source: 'clients' | 'ceidg_prospects' | 'contact_enrichment'
  } | null
}

interface QueueCounts {
  eligible: number
  pending: number
  approved: number
  skipped: number
  already_enriched: number
}

const PER_NIP_COST_USD = 0.021

export function ReviewQueueView() {
  const [data, setData] = useState<QueueItem[]>([])
  const [counts, setCounts] = useState<QueueCounts>({
    eligible: 0,
    pending: 0,
    approved: 0,
    skipped: 0,
    already_enriched: 0,
  })
  const [loading, setLoading] = useState(true)
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)

  async function fetchQueue() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/matches/apify-queue?limit=50')
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Błąd ładowania')
      setData((json.data ?? []) as QueueItem[])
      setCounts(
        json.counts ?? {
          eligible: 0,
          pending: 0,
          approved: 0,
          skipped: 0,
          already_enriched: 0,
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQueue()
  }, [])

  async function setStatus(matchId: string, status: 'approved' | 'skipped' | 'pending') {
    setUpdatingIds((prev) => new Set(prev).add(matchId))
    try {
      const res = await fetch(`/api/matches/${matchId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Update failed')
      // Optimistic update
      setData((prev) =>
        prev.map((d) =>
          d.match_id === matchId
            ? { ...d, apify_review_status: status, apify_reviewed_at: status === 'pending' ? null : new Date().toISOString() }
            : d,
        ),
      )
      setCounts((prev) => {
        const item = data.find((d) => d.match_id === matchId)
        if (!item) return prev
        const oldStatus = item.apify_review_status
        return {
          ...prev,
          [oldStatus]: Math.max(0, prev[oldStatus] - 1),
          [status]: prev[status] + 1,
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdatingIds((prev) => {
        const n = new Set(prev)
        n.delete(matchId)
        return n
      })
    }
  }

  async function bulkSet(ids: string[], status: 'approved' | 'skipped' | 'pending') {
    if (ids.length === 0) return
    setBulkLoading(true)
    try {
      const res = await fetch('/api/matches/apify-queue/bulk-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_ids: ids, status }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Bulk failed')
      await fetchQueue()
      setSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBulkLoading(false)
    }
  }

  async function runApify() {
    if (counts.approved === 0) return
    const cost = (counts.approved * PER_NIP_COST_USD).toFixed(2)
    if (!confirm(`Run Apify на ${counts.approved} approved matches? Estimated cost ~$${cost} (з NIP dedup може бути менше).`)) return
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/enrich/apify-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'mixed', min_combined_score: 70, limit: counts.approved }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error ?? 'Apify failed')
      } else {
        const s = json.summary
        alert(
          `Apify batch DONE\n\n` +
            `Unique NIPs: ${s.unique_nips_attempted}\n` +
            `Successful: ${s.successful_nips}\n` +
            `Partial: ${s.partial_nips}\n` +
            `No match: ${s.no_match_nips}\n` +
            `Errors: ${s.error_nips}\n` +
            `Rows inserted: ${s.rows_inserted}\n` +
            `Cost: $${s.total_cost_usd}`,
        )
      }
      await fetchQueue()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const allVisibleIds = useMemo(() => data.map((d) => d.match_id), [data])
  const allSelected = selected.size > 0 && selected.size === data.length
  // Sprint J: estimated cost considers тільки approved which are NOT
  // already-enriched (pre-flight skip free).
  const approvedNeedingApify = data.filter(
    (d) => d.apify_review_status === 'approved' && d.existing_contact === null,
  ).length
  const estimatedCost = (approvedNeedingApify * PER_NIP_COST_USD).toFixed(2)

  return (
    <div className="space-y-4">
      {/* Counters + actions header */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Badge className="h-7 bg-slate-700 text-white px-3">
            Eligible: {counts.eligible}
          </Badge>
          <Badge className="h-7 bg-green-600 text-white px-3">
            Approved: {counts.approved}
          </Badge>
          <Badge className="h-7 bg-gray-400 text-white px-3">
            Skipped: {counts.skipped}
          </Badge>
          <Badge className="h-7 bg-amber-500 text-white px-3">
            Pending: {counts.pending}
          </Badge>
          {counts.already_enriched > 0 && (
            <Badge className="h-7 bg-purple-600 text-white px-3" title="Кандидати з уже існуючими контактами (Bitrix/CEIDG/cached) — pre-flight skip">
              Już z kontaktami: {counts.already_enriched}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            Est. Apify cost: ${estimatedCost} ({approvedNeedingApify} approved × $0.021,
            pre-flight skipping {counts.already_enriched} z кontaktami)
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchQueue} disabled={loading}>
              <RefreshCwIcon className="size-4 mr-1" />
              Odśwież
            </Button>
            <Button
              onClick={runApify}
              disabled={counts.approved === 0 || running || loading}
              size="sm"
            >
              {running ? (
                <Loader2Icon className="size-4 mr-1 animate-spin" />
              ) : (
                <ZapIcon className="size-4 mr-1" />
              )}
              {running ? 'Apify…' : `Run Apify on approved (${counts.approved})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-sm font-medium">
              {selected.size} zaznaczone:
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkSet(Array.from(selected), 'approved')}
              disabled={bulkLoading}
              className="border-green-300"
            >
              <CheckIcon className="size-4 mr-1 text-green-600" />
              Approve selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkSet(Array.from(selected), 'skipped')}
              disabled={bulkLoading}
            >
              <XIcon className="size-4 mr-1 text-gray-600" />
              Skip selected
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => bulkSet(Array.from(selected), 'pending')}
              disabled={bulkLoading}
            >
              <ClockIcon className="size-4 mr-1" />
              Reset to pending
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              disabled={bulkLoading}
            >
              Odznacz wszystkie
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Bulk all visible */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-medium">
            Wszystkie widoczne ({data.length}):
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkSet(allVisibleIds, 'approved')}
            disabled={bulkLoading || data.length === 0}
            className="border-green-300"
          >
            <CheckIcon className="size-4 mr-1 text-green-600" />
            Approve all visible
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkSet(allVisibleIds, 'skipped')}
            disabled={bulkLoading || data.length === 0}
          >
            <XIcon className="size-4 mr-1 text-gray-600" />
            Skip all
          </Button>
        </CardContent>
      </Card>

      {/* Errors */}
      {error && (
        <Card>
          <CardContent className="p-3 text-sm text-red-600">{error}</CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? 'Ładowanie…' : `${data.length} kandydatów po Layer 1 filter`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">
              <Loader2Icon className="size-4 inline animate-spin" /> Ładowanie…
            </p>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak eligible kandydatów. Uruchom L5/L6 bulk recompute aby
              wygenerować świeży pool.
            </p>
          ) : (
            <ul className="divide-y">
              <li className="grid grid-cols-12 items-center gap-2 pb-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-1">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => {
                      setSelected(checked ? new Set(allVisibleIds) : new Set())
                    }}
                  />
                </div>
                <div className="col-span-1">Status</div>
                <div className="col-span-3">Nazwa / NIP</div>
                <div className="col-span-1">Score</div>
                <div className="col-span-2">PKD / Miasto</div>
                <div className="col-span-2">Top Product</div>
                <div className="col-span-2 text-right">Action</div>
              </li>
              {data.map((row) => (
                <ReviewRow
                  key={row.match_id}
                  row={row}
                  selected={selected.has(row.match_id)}
                  onToggleSelect={(s) => {
                    setSelected((prev) => {
                      const n = new Set(prev)
                      if (s) n.add(row.match_id)
                      else n.delete(row.match_id)
                      return n
                    })
                  }}
                  expanded={expanded.has(row.match_id)}
                  onToggleExpand={() => {
                    setExpanded((prev) => {
                      const n = new Set(prev)
                      if (n.has(row.match_id)) n.delete(row.match_id)
                      else n.add(row.match_id)
                      return n
                    })
                  }}
                  updating={updatingIds.has(row.match_id)}
                  onSetStatus={(s) => setStatus(row.match_id, s)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ReviewRow({
  row,
  selected,
  onToggleSelect,
  expanded,
  onToggleExpand,
  updating,
  onSetStatus,
}: {
  row: QueueItem
  selected: boolean
  onToggleSelect: (s: boolean) => void
  expanded: boolean
  onToggleExpand: () => void
  updating: boolean
  onSetStatus: (s: 'approved' | 'skipped' | 'pending') => void
}) {
  const score = row.combined_score
  const hasAi = row.ai_score !== null
  const scoreColor =
    score >= 80 ? 'bg-green-600' : score >= 70 ? 'bg-amber-500' : 'bg-orange-500'

  const statusIcon = {
    approved: <CheckIcon className="size-4 text-green-600" />,
    skipped: <XIcon className="size-4 text-gray-500" />,
    pending: <ClockIcon className="size-4 text-amber-500" />,
  }[row.apify_review_status]

  const targetHref =
    row.target_type === 'client' ? `/clients/${row.target_id}` : `/intelligence/prospects`

  return (
    <li
      className={cn(
        'grid grid-cols-12 items-start gap-2 py-3',
        row.apify_review_status === 'skipped' && 'opacity-50',
        row.apify_review_status === 'approved' && 'bg-green-50/30',
      )}
    >
      <div className="col-span-1 pt-1">
        <Checkbox checked={selected} onCheckedChange={(c) => onToggleSelect(Boolean(c))} />
      </div>
      <div className="col-span-1 pt-1" title={row.apify_review_status}>
        {statusIcon}
      </div>
      <div className="col-span-3 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={cn(
              'h-5 text-[10px]',
              row.target_type === 'client' ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white',
            )}
          >
            {row.target_type === 'client' ? 'Klient' : 'Prospekt'}
          </Badge>
          {row.also_in_other_table && (
            <span title="NIP istnieje у обох tables (clients + prospects)">
              <Link2Icon className="size-3 text-purple-600" />
            </span>
          )}
          <Link href={targetHref} className="font-medium truncate hover:underline">
            {row.target_name}
          </Link>
        </div>
        <p className="text-xs font-mono text-muted-foreground">{row.nip}</p>
      </div>
      <div className="col-span-1 pt-1">
        <div
          className={cn('inline-flex h-9 w-9 items-center justify-center rounded text-white text-xs font-bold relative', scoreColor)}
          title={hasAi ? `AI: ${row.ai_score} / algo: ${row.algo_score}` : 'Algo only'}
        >
          {score}
          {hasAi && (
            <span className="absolute -top-1 -right-1 size-3 rounded-full bg-purple-600 border border-white text-[7px] flex items-center justify-center text-white font-bold">
              AI
            </span>
          )}
        </div>
      </div>
      <div className="col-span-2 min-w-0 space-y-1 text-xs">
        <div className="font-mono truncate" title={row.pkd.join(', ')}>
          {row.pkd.slice(0, 3).join(', ')}
          {row.pkd.length > 3 && (
            <span className="text-muted-foreground"> +{row.pkd.length - 3}</span>
          )}
        </div>
        <div className="text-muted-foreground truncate">{row.city || '—'}</div>
      </div>
      <div className="col-span-2 min-w-0 space-y-1">
        <div className="text-sm truncate" title={row.product_name}>
          {row.product_name}
        </div>
        <div className="flex flex-wrap gap-1">
          {row.reason_codes.slice(0, 3).map((r, idx) => (
            <Badge key={idx} variant="outline" className="text-[9px] font-mono font-normal">
              {r}
            </Badge>
          ))}
        </div>
      </div>
      <div className="col-span-2 flex flex-col items-end gap-1">
        {row.existing_contact ? (
          <div className="space-y-1 rounded border border-purple-300 bg-purple-50/40 p-1.5 text-[10px]">
            <Badge className="bg-purple-600 text-white text-[9px]" title={`Source: ${row.existing_contact.source}`}>
              ✓ Контакти є
            </Badge>
            {row.existing_contact.phone && (
              <div className="font-mono text-purple-900 truncate" title={row.existing_contact.phone}>
                📞 {row.existing_contact.phone}
              </div>
            )}
            {row.existing_contact.email && (
              <div className="font-mono text-purple-900 truncate" title={row.existing_contact.email}>
                ✉ {row.existing_contact.email.slice(0, 22)}
              </div>
            )}
            {row.existing_contact.website && (
              <div className="font-mono text-purple-900 truncate" title={row.existing_contact.website}>
                🌐 {row.existing_contact.website.slice(0, 22)}
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={row.apify_review_status === 'approved' ? 'default' : 'outline'}
              onClick={() => onSetStatus('approved')}
              disabled={updating}
              className="h-7 px-2"
              title="Approve"
            >
              {updating ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <CheckIcon className="size-3" />
              )}
            </Button>
            <Button
              size="sm"
              variant={row.apify_review_status === 'skipped' ? 'default' : 'outline'}
              onClick={() => onSetStatus('skipped')}
              disabled={updating}
              className="h-7 px-2"
              title="Skip"
            >
              <XIcon className="size-3" />
            </Button>
          </div>
        )}
        {row.ai_reasoning && (
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:underline"
          >
            {expanded ? (
              <ChevronUpIcon className="size-3" />
            ) : (
              <ChevronDownIcon className="size-3" />
            )}
            AI reasoning
          </button>
        )}
      </div>
      {expanded && row.ai_reasoning && (
        <div className="col-span-12 rounded bg-muted/50 p-2 text-xs italic text-muted-foreground">
          🤖 {row.ai_reasoning}
        </div>
      )}
    </li>
  )
}
