'use client'

// components/produkty/product-matches-section.tsx
// Sprint S-CORE.3.B (A+B pieces) — TOP 25 client matching з iterative
// exclusion (per Vadym 04.05).
//
// Behavior:
//   - On mount → fetch GET /api/products/${id}/matches/top
//   - Per-row "Zkontaktowano" → POST /api/products/${id}/matches/mark-contacted
//     → optimistic remove from list + toast + counter update
//   - "Pokaż następnych 25" footer button → re-fetch (server exclusion
//     auto через JOIN з product_match_runs)
//   - Empty state: amber dashed з admin matching refresh hint

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  UsersIcon,
  PhoneIcon,
  Loader2Icon,
  ArrowRightIcon,
  RefreshCwIcon,
  ArrowUpIcon,
} from 'lucide-react'

// Match shape mirrors TopMatchesResponse у API route (keeping in sync via
// shared expectations — could later import тип з '@/app/api/.../route').

interface MatchRow {
  id: string
  target_type: 'client' | 'prospect'
  target_id: string
  title: string
  city: string | null
  industry: string | null
  segment: string | null
  vat_status: string | null
  score: number
  ai_score: number | null
  sales_snippet: unknown
  ai_reasoning: string | null
  expires_at: string
}

interface TopMatchesResponse {
  matches: MatchRow[]
  total_fresh: number
  total_contacted: number
  empty: boolean
  hint?: string
}

interface Props {
  productId: string
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * sales_snippet JSONB shape (per S2A formula) varies. Try to extract
 * a 1-2 line preview from common keys (tagline / opener / pitch).
 */
function extractSnippetPreview(snippet: unknown): string | null {
  if (!snippet || typeof snippet !== 'object') return null
  const obj = snippet as Record<string, unknown>
  const candidates = ['pitch', 'tagline', 'opener', 'value_prop', 'summary']
  for (const key of candidates) {
    const v = obj[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  // Fallback — concatenate всі string values якщо є
  const strings = Object.values(obj).filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  )
  if (strings.length > 0) return strings[0]
  return null
}

function targetHref(row: MatchRow): string {
  if (row.target_type === 'client') return `/clients/${row.target_id}`
  return `/intelligence/lookup?prospect_id=${row.target_id}`
}

// ─── Component ───────────────────────────────────────────────────

export function ProductMatchesSection({ productId }: Props) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<TopMatchesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contactingId, setContactingId] = useState<string | null>(null)

  async function fetchMatches() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/products/${productId}/matches/top`)
      const json = (await res.json()) as TopMatchesResponse | { error?: string }
      if (!res.ok) {
        const msg = (json as { error?: string }).error ?? `HTTP ${res.status}`
        setError(msg)
        return
      }
      setData(json as TopMatchesResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchMatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  async function handleMarkContacted(matchId: string) {
    if (contactingId) return
    setContactingId(matchId)
    const toastId = toast.loading('Oznaczanie...')
    try {
      const res = await fetch(
        `/api/products/${productId}/matches/mark-contacted`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ match_id: matchId }),
        },
      )
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? `HTTP ${res.status}`, { id: toastId })
        return
      }
      // Optimistic remove
      setData((prev) =>
        prev
          ? {
              ...prev,
              matches: prev.matches.filter((m) => m.id !== matchId),
              total_fresh: Math.max(0, prev.total_fresh - 1),
              total_contacted: prev.total_contacted + 1,
            }
          : prev,
      )
      toast.success('Zaznaczono', { id: toastId })
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Błąd sieci',
        { id: toastId },
      )
    } finally {
      setContactingId(null)
    }
  }

  // ─── Loading state ──────────────────────────────────────────

  if (loading && !data) {
    return (
      <Card className="border-l-4 border-l-orange-400">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="size-5 text-purple-500" />
            TOP 25 dopasowanych klientów
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Ładowanie dopasowań…
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Error state ────────────────────────────────────────────

  if (error) {
    return (
      <Card className="border-l-4 border-l-red-400">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="size-5 text-purple-500" />
            TOP 25 dopasowanych klientów
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-700">Błąd: {error}</p>
          <Button size="sm" variant="outline" onClick={fetchMatches} className="mt-2">
            <RefreshCwIcon className="mr-1.5 size-3.5" />
            Spróbuj ponownie
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ─── Empty state ────────────────────────────────────────────

  if (!data || data.empty) {
    return (
      <Card className="border-l-4 border-l-orange-400">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="size-5 text-purple-500" />
            TOP 25 dopasowanych klientów
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded border border-dashed border-amber-300 bg-amber-50/40 p-3 text-sm">
            <ArrowUpIcon className="size-4 shrink-0 text-amber-700" />
            <div className="space-y-1">
              <p className="font-medium text-amber-900">Brak fresh dopasowań.</p>
              <p className="text-xs text-muted-foreground">
                {data?.hint ??
                  'Uruchom matching refresh, aby przeliczyć dopasowania.'}
              </p>
              <Link
                href="/admin/matching"
                className="text-xs text-[#4F46E5] hover:underline"
              >
                Przelicz dopasowania →
              </Link>
            </div>
          </div>
          {data && data.total_contacted > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {data.total_contacted} klientów уже oznaczono jako "Zkontaktowano".
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  // ─── Populated state ────────────────────────────────────────

  const remainingHint = data.total_contacted > 0
    ? ` (з ${data.total_contacted} już zkontaktowano)`
    : ''

  return (
    <Card className="border-l-4 border-l-orange-400 bg-orange-50/10">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersIcon className="size-5 text-purple-500" />
          TOP {data.total_fresh} dopasowanych klientów{remainingHint}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={fetchMatches}
          disabled={loading}
          title="Odśwież listę (server exclusion auto)"
        >
          {loading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-4" />
          )}
          <span className="ml-2 hidden sm:inline">Pokaż następnych 25</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.matches.map((row) => {
          const snippet = extractSnippetPreview(row.sales_snippet)
          const aiBadge = row.ai_score !== null
          const isProspect = row.target_type === 'prospect'
          return (
            <div
              key={row.id}
              className="rounded-md border border-[#E5E1D8] bg-white p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={targetHref(row)}
                      className="text-[14px] font-medium text-[#222] hover:text-[#4F46E5]"
                    >
                      {row.title}
                    </Link>
                    {isProspect && (
                      <Badge
                        variant="outline"
                        className="border-purple-300 bg-purple-50 text-[10px] text-purple-700"
                      >
                        PROSPEKT
                      </Badge>
                    )}
                    {row.city && (
                      <span className="text-[11px] text-[#888]">{row.city}</span>
                    )}
                    {row.segment && (
                      <Badge variant="outline" className="text-[10px]">
                        {row.segment}
                      </Badge>
                    )}
                    {row.industry && (
                      <span className="text-[11px] font-mono text-[#888]">
                        {row.industry}
                      </span>
                    )}
                    {row.vat_status === 'Czynny' && (
                      <Badge
                        variant="outline"
                        className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700"
                      >
                        VAT czynny
                      </Badge>
                    )}
                  </div>
                  {snippet && (
                    <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-[#555]">
                      {snippet}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[14px] font-medium text-[#222]">
                      {row.score}
                    </span>
                    {aiBadge && (
                      <Badge className="bg-purple-100 text-[9px] text-purple-700">
                        AI
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMarkContacted(row.id)}
                      disabled={contactingId === row.id}
                      className="h-7 px-2 text-[11px]"
                      title="Oznacz jako zkontaktowano (wyłącza z TOP)"
                    >
                      {contactingId === row.id ? (
                        <Loader2Icon className="size-3 animate-spin" />
                      ) : (
                        <PhoneIcon className="size-3" />
                      )}
                      <span className="ml-1">Zkontaktowano</span>
                    </Button>
                    <Link
                      href={targetHref(row)}
                      className="flex h-7 items-center gap-1 rounded border border-[#E5E1D8] px-2 text-[11px] hover:bg-[#FAFAF7]"
                    >
                      Szczegóły
                      <ArrowRightIcon className="size-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {data.matches.length === 0 && (
          <p className="text-[12px] text-[#888]">Brak fresh dopasowań.</p>
        )}

        <div className="border-t border-[#F0EDE5] pt-2 text-[10px] text-muted-foreground">
          Sortowane wg combined_score (algo + AI re-score). Wygasa po 7 dniach;
          refresh przez /api/cron/matching-refresh.
        </div>
      </CardContent>
    </Card>
  )
}
