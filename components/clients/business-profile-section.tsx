'use client'

// components/clients/business-profile-section.tsx
// Sprint L Phase 3 — UI для business_profile JSONB на /clients/[id].
// Sprint M FIX 4 — added "Re-analyze" button; consolidates BusinessDataPanel
// + PotentialAnalysisPanel (oba removed).
// Sprint S6A Step 4 (FINAL) — empty-state branch tepere bez button (Опція C):
// замість inline "Analizuj" pokazuje hint do primary "Analiza klienta" w
// ActionBar. With-profile branch: rename "Re-analyze" → "Tylko AI re-run"
// + disabled state коли input_sources empty (full pipeline must run first).
// Sprint TYDZIEN1.A.1.4 FIX 3A (28.05.2026) — dedicated "🏷 Marka handlowa"
// amber chip rendered BEFORE special_traits_pl gdy extracted_brand differs
// od stripped legal name (np. legal='FRESH MEALS FACTORY SPÓŁKA...' →
// extracted_brand='MaczFit'). Distinct color = nie ginie wśród purple traits.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SparklesIcon, RefreshCwIcon, Loader2Icon, ArrowUpIcon } from 'lucide-react'
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
  /** Sprint S-MENU Day 3.1.1 — marka handlowa (override legal title gdy
   *  legal = generic / owner-suffix). Persisted у business_profile JSONB. */
  extracted_brand?: string | null
  extracted_brand_confidence?: 'high' | 'medium' | 'low' | null
}

/** Sprint TYDZIEN1.A.1.4 FIX 3A — strip legal suffix dla comparison
 *  extracted_brand vs legal name. Mirror logiki з lib/enrichment/apify.ts
 *  (stripLegalSuffix) — inline aby uniknąć client-bundle imports z lib/. */
function stripLegalSuffix(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bsp(?:ółka|olka)?\.?\s*z\s*o\.?\s*o\.?\b/gi, '')
    .replace(/\bspółka z ograniczoną odpowiedzialnością\b/gi, '')
    .replace(/\bs\.?a\.?\b/gi, '')
    .replace(/\bsp\.?\s*k\.?\b/gi, '')
    .replace(/\bsp\.?\s*j\.?\b/gi, '')
    .replace(/\bp\.?\s*s\.?\s*a\.?\b/gi, '')
    .replace(/[^a-zа-яёіїєґ0-9]/gi, '')
    .trim()
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
  legalName,
}: {
  clientId: string
  profile: BusinessProfile | null
  /** Sprint TYDZIEN1.A.1.4 FIX 3A — clients.title для comparison
   *  extracted_brand vs stripped legal name. Opcjonalny — fallback do
   *  zawsze render chip jeśli brand defined ale title not provided. */
  legalName?: string | null
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
    // Sprint S6A Step 4 (Опція C) — empty state без inline button.
    // User-facing hint kieruje do primary "Analiza klienta" w ActionBar.
    // Eliminuje confusion між AI-only re-run a full pipeline.
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
              <p className="font-medium text-amber-900">Brak analizy biznesowej.</p>
              <p className="text-xs text-muted-foreground">
                Uruchom <span className="font-medium">&quot;Analiza klienta&quot;</span> w panelu akcji
                powyżej — pobierze wszystkie źródła (KRS, GUS, BZP, Tavily, Apify, business AI, AI re-score)
                i wygeneruje profil.
              </p>
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
    )
  }

  const strength = profile.buyer_strength_for_chm ?? 0

  // Sprint TYDZIEN1.A.1.4 FIX 3A — dedicated brand chip gdy extracted_brand
  // differs від stripped legal name. Heuristic: jeśli normalized brand !==
  // normalized stripped legal title → render highlighted chip. Gdy legalName
  // not provided albo brand match → null (chip nie rendered).
  const showBrandChip = (() => {
    const brand = profile.extracted_brand
    if (!brand || brand.trim() === '') return false
    const normalizedBrand = stripLegalSuffix(brand)
    if (!normalizedBrand) return false
    if (!legalName) return true // fallback — render gdy nie wiemy z czym porównać
    const normalizedLegal = stripLegalSuffix(legalName)
    return normalizedBrand !== normalizedLegal
  })()

  return (
    <Card className="border-l-4 border-l-orange-400 bg-orange-50/10">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-5 text-purple-500" />
          Analiza biznesowa (AI)
        </CardTitle>
        <div className="flex items-start gap-3">
          <div className="text-right text-xs text-muted-foreground">
            {profile.analyzed_at && new Date(profile.analyzed_at).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })}
            <div className="font-mono">{profile.model_used}</div>
          </div>
          {/* Sprint S6A Step 4 — inline re-run AI tylko (BEZ refresh sources).
              Disabled gdy input_sources empty (znaczy sources nie zebrane —
              user musi uruchomić "Analiza klienta" w ActionBar najpierw). */}
          <Button
            size="sm"
            variant="outline"
            onClick={reanalyze}
            disabled={
              analyzing ||
              !profile.input_sources ||
              profile.input_sources.length === 0
            }
            title={
              !profile.input_sources || profile.input_sources.length === 0
                ? 'Spuszczone sources są wymagane. Uruchom "Analiza klienta" najpierw.'
                : 'Re-run AI analysis tylko (bez refresh sources). Dla pełnej analizy use "Analiza klienta" button w panelu akcji.'
            }
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

        {/* Sprint TYDZIEN1.A.1.4 FIX 3A — dedicated brand chip BEFORE
            special_traits_pl. Distinct amber color (vs purple traits) aby
            marka handlowa nie ginęła wśród generic cech. */}
        {showBrandChip && profile.extracted_brand && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Marka handlowa:</div>
            <Badge className="bg-amber-100 text-amber-900 text-xs font-semibold border border-amber-300">
              🏷 {profile.extracted_brand}
              {profile.extracted_brand_confidence === 'high' && (
                <span className="ml-1 text-[10px] font-normal text-amber-700">(high)</span>
              )}
            </Badge>
          </div>
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
            // Sprint S-CLEAN ETAP 2 (13.05.2026) — Pikniko removed (Vadym
            // pivoted to direct Ziomek Fish sales). Replaced з SpoonJoy
            // (Day 0 supplier seed).
            { name: 'SpoonJoy', strength: null, skuCount: null },
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
