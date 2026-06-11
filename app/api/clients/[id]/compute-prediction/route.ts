// app/api/clients/[id]/compute-prediction/route.ts
// Fix 12.06 — jawne liczenie prognozy POZA renderem karty.
//
// Render czyta tylko gotowy cache (menu_predictions). Tu liczymy:
// aggregateMonthlyIngredients (silnik batchowy — paczki ~30 dań/Haiku,
// zapis przyrostowy do dish_ingredient_mappings) → zapis menu_predictions.
// Przerwanie nie traci postępu (cache per-danie zapisany w środku batcha).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateMonthlyIngredients } from '@/lib/predictions/aggregate-ingredients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID_RE = /^[0-9a-f-]{36}$/i

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: 'Niepoprawne ID klienta' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  const { data: paramsRow } = await supabase
    .from('params')
    .select('anthropic_api_key')
    .limit(1)
    .maybeSingle()
  const anthropicKey = (paramsRow as { anthropic_api_key?: string } | null)?.anthropic_api_key ?? ''
  if (!anthropicKey) {
    return NextResponse.json(
      { ok: false, error: 'Brak anthropic_api_key w params' },
      { status: 400 },
    )
  }

  try {
    const { prediction, error } = await aggregateMonthlyIngredients(supabase, id, anthropicKey)
    if (!prediction) {
      return NextResponse.json(
        { ok: false, error: error || 'Nie udało się policzyć prognozy' },
        { status: 422 },
      )
    }
    return NextResponse.json({
      ok: true,
      prediction_id: prediction.prediction_id ?? null,
      dishes_count: prediction.dishes_count,
      coverage_tier: prediction.coverage_tier,
      ingredients: prediction.ingredients.length,
      ai_calls: prediction.ai_calls_made,
      ai_cost_usd: prediction.ai_total_cost_usd,
    })
  } catch (e: any) {
    console.error('[compute-prediction] failed', { clientId: id, error: e?.message })
    return NextResponse.json(
      { ok: false, error: e?.message || 'Błąd liczenia prognozy' },
      { status: 500 },
    )
  }
}
