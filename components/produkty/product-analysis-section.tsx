'use client'

// components/produkty/product-analysis-section.tsx
// Sprint S-CORE.3.A α' — UI для products.business_profile JSONB.
// Mirror clients/business-profile-section.tsx pattern (simplified).
//
// Empty state: amber dashed з hint do "Analiza produktu" button у detail
// panel header (analogous до clients pattern Step 4).
//
// Populated state: orange-l-border Card з segments display + pitch per
// segment + next steps + model meta + "Tylko AI re-run" button.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  SparklesIcon,
  RefreshCwIcon,
  Loader2Icon,
  ArrowUpIcon,
  TrendingUpIcon,
  ZapIcon,
  ThermometerIcon,
} from 'lucide-react'

// ─── Stored business_profile shape (matches API route output) ─────

export interface ProductBusinessProfile {
  segments?: { hot?: string; warm?: string; cold?: string }
  pitch_per_segment?: { hot?: string; warm?: string; cold?: string }
  next_steps?: string[]
  analyzed_at?: string
  model_used?: string
  cost_usd?: number
  input_context?: {
    product_name?: string
    sku?: string
    price_pln?: number | null
    category?: string | null
    total_clients?: string
    top_matches?: string
  }
}

interface Props {
  productId: string
  profile: ProductBusinessProfile | null
}

const SEGMENT_META: Array<{
  key: 'hot' | 'warm' | 'cold'
  label: string
  Icon: typeof ZapIcon
  badgeClass: string
  iconClass: string
}> = [
  {
    key: 'hot',
    label: 'Hot',
    Icon: ZapIcon,
    badgeClass: 'bg-red-600 text-white',
    iconClass: 'text-red-500',
  },
  {
    key: 'warm',
    label: 'Warm',
    Icon: TrendingUpIcon,
    badgeClass: 'bg-orange-500 text-white',
    iconClass: 'text-orange-500',
  },
  {
    key: 'cold',
    label: 'Cold',
    Icon: ThermometerIcon,
    badgeClass: 'bg-blue-500 text-white',
    iconClass: 'text-blue-500',
  },
]

export function ProductAnalysisSection({ productId, profile }: Props) {
  const router = useRouter()
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reanalyze() {
    setAnalyzing(true)
    setError(null)
    try {
      const res = await fetch(`/api/products/${productId}/full-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!json.ok) {
        setError(json.error ?? 'Analiza nie powiodła się')
      } else {
        router.refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setAnalyzing(false)
    }
  }

  // ─── Empty state (no profile yet) ──────────────────────────────

  const hasContent =
    profile &&
    (profile.segments?.hot ||
      profile.segments?.warm ||
      profile.segments?.cold)

  if (!hasContent) {
    return (
      <Card className="border-l-4 border-l-orange-400">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SparklesIcon className="size-5 text-purple-500" />
            Analiza biznesowa (AI)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded border border-dashed border-amber-300 bg-amber-50/40 p-3 text-sm">
            <ArrowUpIcon className="size-4 shrink-0 text-amber-700" />
            <div className="space-y-1">
              <p className="font-medium text-amber-900">
                Brak analizy biznesowej.
              </p>
              <p className="text-xs text-muted-foreground">
                Uruchom <span className="font-medium">&quot;Analiza produktu&quot;</span>{' '}
                w panelu akcji powyżej — wygeneruje strategię sprzedaży
                per segment (hot/warm/cold) z pitch i następnymi krokami.
              </p>
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
    )
  }

  // ─── Populated state ────────────────────────────────────────────

  const analyzedAtPl = profile.analyzed_at
    ? new Date(profile.analyzed_at).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })
    : null
  const nextSteps = profile.next_steps ?? []

  return (
    <Card className="border-l-4 border-l-orange-400 bg-orange-50/10">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-5 text-purple-500" />
          Analiza biznesowa (AI)
        </CardTitle>
        <div className="flex items-start gap-3">
          <div className="text-right text-xs text-muted-foreground">
            {analyzedAtPl}
            <div className="font-mono">{profile.model_used}</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={reanalyze}
            disabled={analyzing}
            title="Re-run AI analysis. Cost ~$0.05-0.10."
          >
            {analyzing ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-4" />
            )}
            <span className="ml-2 hidden sm:inline">Tylko AI re-run</span>
          </Button>
        </div>
      </CardHeader>
      {error && (
        <div className="mx-6 -mt-2 mb-2 rounded bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <CardContent className="space-y-5">
        {/* ─── Segments ─── */}
        <div className="space-y-3">
          {SEGMENT_META.map(({ key, label, Icon, badgeClass, iconClass }) => {
            const segDesc = profile.segments?.[key]
            const segPitch = profile.pitch_per_segment?.[key]
            if (!segDesc && !segPitch) return null
            return (
              <div
                key={key}
                className="rounded-md border border-[#E5E1D8] bg-white p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Icon className={`size-4 ${iconClass}`} />
                  <Badge className={`${badgeClass} text-[10px] font-medium`}>
                    {label.toUpperCase()}
                  </Badge>
                  {segDesc && (
                    <span className="text-[12px] text-[#555]">{segDesc}</span>
                  )}
                </div>
                {segPitch && (
                  <p className="text-[13px] leading-relaxed text-[#222]">
                    {segPitch}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* ─── Next steps ─── */}
        {nextSteps.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Następne kroki:
            </div>
            <ol className="ml-5 list-decimal space-y-1 text-[13px] text-[#222]">
              {nextSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {/* ─── Input context footer ─── */}
        {profile.input_context && (
          <div className="border-t border-[#F0EDE5] pt-2 text-[10px] text-muted-foreground">
            Kontekst wejściowy: klientów w bazie ={' '}
            {profile.input_context.total_clients ?? '—'}
            {profile.cost_usd !== undefined && (
              <span className="ml-2">
                · cost ${profile.cost_usd.toFixed(4)}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
