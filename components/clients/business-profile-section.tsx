'use client'

// components/clients/business-profile-section.tsx
// Sprint L Phase 3 — UI для business_profile JSONB на /clients/[id].
// Sprint M FIX 4 — added "Re-analyze" button; consolidates BusinessDataPanel
// + PotentialAnalysisPanel (oba removed).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SparklesIcon, RefreshCwIcon, Loader2Icon } from 'lucide-react'
import { SupplierMatrix } from './supplier-matrix'

interface BusinessProfile {
  business_format?: string
  estimated_locations?: number | null
  product_categories_pl?: string[]
  target_demographics_pl?: string[]
  special_traits_pl?: string[]
  business_summary_pl?: string
  buyer_strength_for_chm?: number
  buyer_reasoning_pl?: string
  model_used?: string
  analyzed_at?: string
  input_sources?: string[]
}

const FORMAT_LABELS: Record<string, string> = {
  single_store: 'Pojedynczy sklep',
  chain: 'Sieć sklepów',
  franchise: 'Franczyza',
  online: 'Sklep online',
  B2B_distributor: 'Dystrybutor B2B',
  gastronomy: 'Gastronomia',
  manufacturer: 'Producent',
  service: 'Usługi',
  other: 'Inne',
}

export function BusinessProfileSection({
  clientId,
  profile,
}: {
  clientId: string
  profile: BusinessProfile | null
}) {
  const router = useRouter()
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reanalyze() {
    setAnalyzing(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/analyze-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
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

  if (!profile || !profile.business_format) {
    return (
      <Card className="border-l-4 border-l-orange-400">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <SparklesIcon className="size-5 text-purple-500" />
            Analiza biznesowa (AI)
          </CardTitle>
          <Button size="sm" variant="outline" onClick={reanalyze} disabled={analyzing}>
            {analyzing ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
            <span className="ml-2">Analizuj</span>
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Brak analizy biznesowej. Uruchom Intelligence Lookup albo kliknij Analizuj — AI wygeneruje profil.
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
    )
  }

  const strength = profile.buyer_strength_for_chm ?? 0

  return (
    <Card className="border-l-4 border-l-orange-400 bg-orange-50/10">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-5 text-purple-500" />
          Analiza biznesowa (AI)
        </CardTitle>
        <div className="flex items-start gap-3">
          <div className="text-right text-xs text-muted-foreground">
            {profile.analyzed_at && new Date(profile.analyzed_at).toLocaleDateString('pl-PL')}
            <div className="font-mono">{profile.model_used}</div>
          </div>
          <Button size="sm" variant="outline" onClick={reanalyze} disabled={analyzing}>
            {analyzing ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-4" />
            )}
            <span className="ml-2 hidden sm:inline">Re-analyze</span>
          </Button>
        </div>
      </CardHeader>
      {error && (
        <div className="mx-6 -mt-2 mb-2 rounded bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <CardContent className="space-y-3">
        {/* Top row: format + locations */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-purple-600 text-white">
            {FORMAT_LABELS[profile.business_format] ?? profile.business_format}
          </Badge>
          {profile.estimated_locations !== null && profile.estimated_locations !== undefined && profile.estimated_locations > 0 && (
            <Badge variant="outline">~{profile.estimated_locations} lokalizacji</Badge>
          )}
        </div>

        {/* Summary */}
        {profile.business_summary_pl && (
          <p className="text-sm leading-relaxed">{profile.business_summary_pl}</p>
        )}

        {/* Special traits */}
        {profile.special_traits_pl && profile.special_traits_pl.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Specjalne cechy:</div>
            <div className="flex flex-wrap gap-1">
              {profile.special_traits_pl.map((t, i) => (
                <Badge key={i} className="bg-purple-100 text-purple-800 text-xs">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Target demographics */}
        {profile.target_demographics_pl && profile.target_demographics_pl.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Klient docelowy:</div>
            <div className="flex flex-wrap gap-1">
              {profile.target_demographics_pl.map((t, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Product categories */}
        {profile.product_categories_pl && profile.product_categories_pl.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Kategorie produktów:</div>
            <div className="flex flex-wrap gap-1">
              {profile.product_categories_pl.slice(0, 8).map((c, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {c}
                </Badge>
              ))}
              {profile.product_categories_pl.length > 8 && (
                <span className="text-[10px] text-muted-foreground">+{profile.product_categories_pl.length - 8}</span>
              )}
            </div>
          </div>
        )}

        {/* Multi-supplier buyer-strength matrix. Only ChM has real value
            until Sprint M wires per-supplier scoring. */}
        <SupplierMatrix
          clientId={clientId}
          rows={[
            { name: 'Czudowa Marka', strength: strength, skuCount: null },
            { name: 'Mod-loszka', strength: null, skuCount: null },
            { name: 'Gmurczyk', strength: null, skuCount: null },
            { name: 'Karol', strength: null, skuCount: null },
            { name: 'Pikniko', strength: null, skuCount: null },
          ]}
        />

        {profile.buyer_reasoning_pl && (
          <p className="text-xs italic text-muted-foreground">🤖 {profile.buyer_reasoning_pl}</p>
        )}

        {/* Input sources */}
        {profile.input_sources && profile.input_sources.length > 0 && (
          <div className="text-[10px] text-muted-foreground">
            Źródła analizy: {profile.input_sources.join(', ')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
