// components/clients/predictions-section-async.tsx
// Sprint TYDZIEN2 PERF (28.05.2026) — async server component dla predictions.
//
// Wcześniej aggregateMonthlyIngredients() działało w page.tsx server render
// → AI calls (Haiku per dish) blokowały page render → Vercel 503 timeout →
// fallback hard reload 4.8s ("klick u kohorcie nie reaguje z 1 razu").
//
// Tu: async server component opakowany u Suspense w page.tsx. Page renderуje
// HTML natychmiast z PredictionsLoadingSkeleton fallback; ten component
// streamuje siebie po zakończeniu AI calls. React 19 streaming pattern.
//
// Props minimal — clientId + apify reviews count. Wszystko inne robi sam
// (SELECT params, anthropic key, aggregateMonthlyIngredients call).

import { createClient } from '@/lib/supabase/server'
import { aggregateMonthlyIngredients } from '@/lib/predictions/aggregate-ingredients'

import { PredictionsSection } from './predictions-section'

interface Props {
  clientId: string
  reviewsCount: number
}

export async function PredictionsSectionAsync({ clientId, reviewsCount }: Props) {
  const supabase = await createClient()

  let aggregatedPrediction: Awaited<
    ReturnType<typeof aggregateMonthlyIngredients>
  >['prediction'] = null

  try {
    const { data: paramsRow } = await supabase
      .from('params')
      .select('anthropic_api_key')
      .limit(1)
      .maybeSingle()
    const anthropicKey =
      (paramsRow as { anthropic_api_key?: string } | null)?.anthropic_api_key ?? ''
    if (anthropicKey) {
      const { prediction } = await aggregateMonthlyIngredients(
        supabase,
        clientId,
        anthropicKey,
      )
      aggregatedPrediction = prediction
    }
  } catch (err) {
    // Non-fatal — render fallback UI below.
    console.error('[predictions] aggregation failed:', err)
  }

  if (!aggregatedPrediction) {
    return (
      <div className="rounded border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Prognoza niedostępna</p>
        <p className="mt-1 text-xs">
          Możliwe przyczyny: brak <code>anthropic_api_key</code> w params,
          brak business_profile.client_type=&apos;gastronomia&apos; w DB
          (sprawdź badge), lub agregacja zwróciła błąd (sprawdź logs serwera).
        </p>
        <p className="mt-2 text-xs text-amber-800">
          Uruchom &quot;Pełna re-analiza&quot; aby odświeżyć źródła danych.
        </p>
      </div>
    )
  }

  return (
    <PredictionsSection
      predictionId={aggregatedPrediction.prediction_id ?? null}
      coverage={aggregatedPrediction.coverage_tier}
      predictionConfidence={aggregatedPrediction.prediction_confidence}
      dishesCount={aggregatedPrediction.dishes_count}
      dishesSource={aggregatedPrediction.dishes_source}
      volume={aggregatedPrediction.volume}
      ingredients={aggregatedPrediction.ingredients}
      reviewsCount={reviewsCount}
    />
  )
}
