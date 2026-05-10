'use server'

// app/clients/[id]/actions/save-prediction-correction.ts
// Sprint S6D Day 4 (12.05.2026) — server action для Vadym коригує actual_data
// на menu_predictions row. Protocol 34 — explicit save (не save-on-blur).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

interface CorrectionInput {
  predictionId: string
  /** Per-ingredient actual kg/month (z Vadym knowledge) */
  actualKg: Record<string, number>
  /** 'invoice' | 'client_call' | 'estimate' */
  source: 'invoice' | 'client_call' | 'estimate'
  notes?: string
}

interface Result {
  ok: boolean
  error?: string
  correctionFactor?: number
}

export async function savePredictionCorrection(
  input: CorrectionInput,
): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nieautoryzowany' }

  // Fetch prediction row
  const { data: row, error: fetchErr } = await supabase
    .from('menu_predictions')
    .select('id, client_id, prediction')
    .eq('id', input.predictionId)
    .single()
  if (fetchErr || !row) {
    return { ok: false, error: `Prediction nie znaleziona: ${fetchErr?.message ?? ''}` }
  }
  const predicted_kg = (row as { prediction: { ingredients_kg?: Record<string, number> } }).prediction.ingredients_kg ?? {}

  // Compute correction_factor = avg(actual / predicted) для ingredients що Vadym filled
  let totalRatio = 0
  let ratioCount = 0
  for (const [ingredient, actual] of Object.entries(input.actualKg)) {
    const predicted = predicted_kg[ingredient]
    if (typeof predicted === 'number' && predicted > 0 && actual >= 0) {
      totalRatio += actual / predicted
      ratioCount += 1
    }
  }
  const correctionFactor = ratioCount > 0 ? totalRatio / ratioCount : 1.0

  const { error: updateErr } = await supabase
    .from('menu_predictions')
    .update({
      actual_data: {
        actual_orders_kg: input.actualKg,
        source: input.source,
        confirmed_at: new Date().toISOString(),
      },
      confirmed_at: new Date().toISOString(),
      correction_factor: correctionFactor,
      notes: input.notes ?? null,
    })
    .eq('id', input.predictionId)
  if (updateErr) {
    return { ok: false, error: `Update failed: ${updateErr.message}` }
  }

  const clientId = (row as { client_id: string }).client_id
  revalidatePath(`/clients/${clientId}`)
  return { ok: true, correctionFactor }
}
