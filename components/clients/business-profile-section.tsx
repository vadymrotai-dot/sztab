// components/clients/business-profile-section.tsx
// Sprint L Phase 3 — UI для business_profile JSONB на /clients/[id].

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SparklesIcon } from 'lucide-react'

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

export function BusinessProfileSection({ profile }: { profile: BusinessProfile | null }) {
  if (!profile || !profile.business_format) {
    return (
      <Card className="border-l-4 border-l-purple-400">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SparklesIcon className="size-5 text-purple-500" />
            Profil biznesowy (AI)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Brak analizy biznesowej. Uruchom Intelligence Lookup żeby AI wygenerowało profil.
          </p>
        </CardContent>
      </Card>
    )
  }

  const strength = profile.buyer_strength_for_chm ?? 0
  const strengthColor =
    strength >= 70 ? 'bg-green-600' : strength >= 40 ? 'bg-amber-500' : 'bg-gray-400'

  return (
    <Card className="border-l-4 border-l-purple-400 bg-purple-50/20">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-5 text-purple-500" />
          Profil biznesowy (AI)
        </CardTitle>
        <div className="text-right text-xs text-muted-foreground">
          {profile.analyzed_at && new Date(profile.analyzed_at).toLocaleDateString('pl-PL')}
          <div className="font-mono">{profile.model_used}</div>
        </div>
      </CardHeader>
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

        {/* Buyer strength для ChM */}
        <div className="rounded border bg-background p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium">Buyer strength dla ChM Czudowa Marka</span>
            <span className="text-lg font-semibold">{strength}/100</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-muted">
            <div className={`h-full ${strengthColor}`} style={{ width: `${strength}%` }} />
          </div>
          {profile.buyer_reasoning_pl && (
            <p className="mt-2 text-xs italic text-muted-foreground">🤖 {profile.buyer_reasoning_pl}</p>
          )}
        </div>

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
