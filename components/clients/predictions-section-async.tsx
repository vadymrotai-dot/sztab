// components/clients/predictions-section-async.tsx
// Fix 12.06 — RENDER NIGDY NIE LICZY.
//
// Wcześniej ten async server component wołał aggregateMonthlyIngredients()
// w renderze → 127 sekwencyjnych Haiku per danie → przekroczenie maxDuration
// → funkcja ginęła w streamie → "This page couldn't load" + wieczny spinner,
// a cache nigdy się nie zapisywał (insert na końcu).
//
// Teraz: czytamy WYŁĄCZNIE gotowy cache z menu_predictions (najnowszy wiersz)
// i renderujemy. Brak cache → karta z przyciskiem "Policz prognozę"
// (PredictionsComputeCard → POST /api/clients/[id]/compute-prediction, batch).
// Strona ładuje się zawsze szybko, niezależnie od rozmiaru menu.

import { createClient } from '@/lib/supabase/server'
import { normalizeIngredientName } from '@/lib/predictions/dish-ingredients'

import { PredictionsSection, type AggregatedIngredient } from './predictions-section'
import { PredictionsComputeCard } from './predictions-compute-card'

const LOW_MULTIPLIER = 0.7
const HIGH_MULTIPLIER = 1.5

interface Props {
  clientId: string
  reviewsCount: number
}

interface MenuPredictionRow {
  id: string
  source_data: {
    dishes_count?: number
    dishes_source?: string
    coverage_tier?: string
    client_subtype?: string | null
    months_since_open?: number
    reviews_count?: number
  } | null
  formula_params: Record<string, unknown> | null
  prediction: {
    customers_low?: number
    customers_mid?: number
    customers_high?: number
    visits_mid?: number
    ingredients_kg?: Record<string, number>
    confidence?: number
  } | null
  created_at: string
}

export async function PredictionsSectionAsync({ clientId, reviewsCount }: Props) {
  const supabase = await createClient()

  // RENDER = tylko odczyt najnowszego cache. ZERO compute.
  const { data: row } = await supabase
    .from('menu_predictions')
    .select('id, source_data, formula_params, prediction, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const cached = (row ?? null) as MenuPredictionRow | null
  const ingredientsKg = cached?.prediction?.ingredients_kg ?? null

  // Brak gotowej prognozy → przycisk "Policz prognozę" (compute w tle, batch).
  if (!cached || !ingredientsKg || Object.keys(ingredientsKg).length === 0) {
    return <PredictionsComputeCard clientId={clientId} hasCache={!!cached} />
  }

  // Rekonstrukcja z cache (kg_mid zapisany; low/high z mnożników silnika).
  const ingredients: AggregatedIngredient[] = Object.entries(ingredientsKg)
    .map(([name, kgMid]) => ({
      name,
      name_normalized: normalizeIngredientName(name),
      kg_mid: kgMid,
      kg_low: Math.round(kgMid * LOW_MULTIPLIER * 10) / 10,
      kg_high: Math.round(kgMid * HIGH_MULTIPLIER * 10) / 10,
      source_dish_count: 1,
      avg_confidence: cached.prediction?.confidence ?? 0.5,
    }))
    .sort((a, b) => b.kg_mid - a.kg_mid)

  const sd = cached.source_data ?? {}
  const pr = cached.prediction ?? {}
  const fp = (cached.formula_params ?? {}) as {
    conversion_mid?: number
    subtype_frequency?: number
    location_multiplier?: number
  }

  return (
    <div className="space-y-2">
      <PredictionsSection
        predictionId={cached.id}
        coverage={(sd.coverage_tier as 'full_menu' | 'popular_only' | 'subtype_only') ?? 'subtype_only'}
        predictionConfidence={pr.confidence ?? 0.5}
        dishesCount={sd.dishes_count ?? 0}
        dishesSource={(sd.dishes_source as never) ?? 'subtype_default'}
        volume={{
          customers_low: pr.customers_low ?? 0,
          customers_mid: pr.customers_mid ?? 0,
          customers_high: pr.customers_high ?? 0,
          visits_mid: pr.visits_mid ?? 0,
          monthly_reviews: sd.reviews_count ?? 0,
          subtype_used: sd.client_subtype ?? 'inne',
          months_used: sd.months_since_open ?? 0,
          formula_params: {
            conversion_mid: fp.conversion_mid ?? 0,
            subtype_frequency: fp.subtype_frequency ?? 0,
            location_multiplier: fp.location_multiplier ?? 1,
          },
        }}
        ingredients={ingredients}
        reviewsCount={reviewsCount}
      />
      <PredictionsComputeCard clientId={clientId} hasCache compact />
    </div>
  )
}
