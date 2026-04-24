'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  Target,
  RefreshCw,
  X,
  TrendingUp,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

interface PotentialAnalysis {
  potential_score?: number
  recommended_segment?: string
  potential_summary?: string
  strategy?: string
  offer_recommendations?: string
  risks?: string
  generated_at?: string
  model?: string
  sources?: Array<{ uri?: string; title?: string }>
}

interface Props {
  clientId: string
  currentSegment?: string
  initial?: PotentialAnalysis | null
}

const SEGMENT_LABELS: Record<string, string> = {
  niesklasyfikowany: 'Niesklasyfikowany',
  maly_opt: 'Maly opt (50%)',
  sredni_opt: 'Sredni opt (40%)',
  duzy_opt: 'Duzy opt (35%)',
  katalog: 'Katalog (32%)',
  docel: 'Docel (23%)',
}

function scoreColor(score: number): string {
  if (score >= 8) return 'text-green-600 bg-green-50 border-green-200'
  if (score >= 5) return 'text-amber-600 bg-amber-50 border-amber-200'
  if (score >= 3) return 'text-orange-600 bg-orange-50 border-orange-200'
  return 'text-red-600 bg-red-50 border-red-200'
}

function scoreLabel(score: number): string {
  if (score >= 8) return 'Wysoki potencjal'
  if (score >= 5) return 'Sredni potencjal'
  if (score >= 3) return 'Niski potencjal'
  return 'Nie pasuje'
}

export function PotentialAnalysisPanel({
  clientId,
  currentSegment,
  initial,
}: Props) {
  const [data, setData] = useState<PotentialAnalysis | null>(initial || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoAssigned, setAutoAssigned] = useState<string | null>(null)
  const router = useRouter()

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    setAutoAssigned(null)
    try {
      const res = await fetch('/api/ai/potential-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const json = await res.json()
      if (!json?.ok) {
        setError(json?.error || 'Blad analizy potencjalu')
        setLoading(false)
        return
      }
      setData(json.potentialAnalysis)
      if (json.autoAssignedSegment) {
        setAutoAssigned(json.autoAssignedSegment)
      }
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Blad sieci')
    } finally {
      setLoading(false)
    }
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4" />
            Analiza potencjalu wspolpracy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            AI oceni potencjal wspolpracy tego klienta z Ziomek Fish, zaproponuje
            segment cenowy, strategie podejscia i rekomendacje ofertowe.
          </p>
          <Button
            type="button"
            onClick={handleAnalyze}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <>
                <Spinner className="size-4" />
                Analiza w toku...
              </>
            ) : (
              <>
                <Target className="size-4" />
                Analizuj potencjal
              </>
            )}
          </Button>
          {error && (
            <p className="mt-3 text-sm text-destructive">
              <X className="mr-1 inline size-4" />
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  const score = Number(data.potential_score) || 0
  const recommended = data.recommended_segment || 'niesklasyfikowany'
  const recommendedLabel = SEGMENT_LABELS[recommended] || recommended

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4" />
            Analiza potencjalu
            {data.generated_at && (
              <span className="text-xs font-normal text-muted-foreground">
                (
                {new Date(data.generated_at).toLocaleString('pl-PL', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                )
              </span>
            )}
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleAnalyze}
            disabled={loading}
            className="gap-1 text-xs"
          >
            {loading ? (
              <Spinner className="size-3" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Odswiez
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score + recommended segment */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div
            className={cn(
              'rounded-lg border p-3',
              scoreColor(score)
            )}
          >
            <div className="text-xs font-medium uppercase tracking-wide opacity-75">
              Potencjal
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold">{score}</span>
              <span className="text-sm opacity-75">/ 10</span>
            </div>
            <div className="mt-1 text-xs font-medium">{scoreLabel(score)}</div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rekomendowany segment
            </div>
            <div className="mt-1 text-sm font-medium">{recommendedLabel}</div>
            {autoAssigned && (
              <div className="mt-1 flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="size-3" />
                Automatycznie przypisany
              </div>
            )}
            {currentSegment && currentSegment !== 'niesklasyfikowany' && currentSegment !== recommended && (
              <div className="mt-1 text-xs text-amber-600">
                Obecny: {SEGMENT_LABELS[currentSegment] || currentSegment}
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        {data.potential_summary && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="size-3" />
              Ocena dopasowania
            </div>
            <p className="text-sm">{data.potential_summary}</p>
          </div>
        )}

        {/* Strategy */}
        {data.strategy && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Lightbulb className="size-3" />
              Strategia
            </div>
            <p className="text-sm">{data.strategy}</p>
          </div>
        )}

        {/* Offer recommendations */}
        {data.offer_recommendations && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rekomendacje ofertowe
            </div>
            <p className="text-sm">{data.offer_recommendations}</p>
          </div>
        )}

        {/* Risks */}
        {data.risks && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="size-3" />
              Ryzyka
            </div>
            <p className="text-sm">{data.risks}</p>
          </div>
        )}

        {/* Sources */}
        {data.sources && data.sources.length > 0 && (
          <details className="mt-4 border-t pt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Zrodla ({data.sources.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {data.sources.map((s, i) => (
                <li key={i} className="text-xs">
                  <a
                    href={s.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {s.title || s.uri}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}

        {error && (
          <p className="text-sm text-destructive">
            <X className="mr-1 inline size-4" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
