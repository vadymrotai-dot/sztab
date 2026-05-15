// lib/predictions/aggregate-ingredients.ts
// Sprint S6D Day 4 (12.05.2026) — 3-tier ingredient aggregation engine.
//
// Coverage tiers (auto-detected from contact_enrichment menu rows):
//   1. full_menu      — dishes_count > 15 → use real menu, AI ingredient extract per dish
//   2. popular_only   — dishes_count 1-15 → use real dishes + AI extrapolate за popularity share
//   3. subtype_only   — dishes_count = 0 → use SUBTYPE_INGREDIENT_DEFAULTS distribution
//
// For each dish:
//   monthly_servings = visits_mid × popularity_share
//   ingredient_grams = monthly_servings × ingredient.grams_per_portion
//
// Aggregate by ingredient_normalized → sum grams → / 1000 → kg.
// Apply low/mid/high spread: low=×0.7, mid=×1.0, high=×1.5
//
// Save aggregated prediction до menu_predictions table for audit trail
// (Day 4 calibration loop — Vadym confirms actual_data → correction_factor).

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  calculateMonthlyVolume,
  calculateMonthsSinceOpen,
  type VolumePrediction,
  type RestaurantSubtype,
} from './restaurant-volume'
import { getDishIngredients, normalizeIngredientName } from './dish-ingredients'
import { SUBTYPE_INGREDIENT_DEFAULTS } from './subtype-defaults'

const LOW_MULTIPLIER = 0.7
const HIGH_MULTIPLIER = 1.5
const FULL_MENU_THRESHOLD = 15  // dishes count → full_menu tier
const PREDICTION_CONFIDENCE: Record<CoverageTier, number> = {
  full_menu: 0.75,
  popular_only: 0.60,
  subtype_only: 0.50,
}

export type CoverageTier = 'full_menu' | 'popular_only' | 'subtype_only'

export interface AggregatedIngredient {
  name: string
  name_normalized: string
  kg_low: number
  kg_mid: number
  kg_high: number
  source_dish_count: number   // скільки страв contribute це інгредієнт
  avg_confidence: number      // averaged from dish-level confidence
}

export interface AggregatedPrediction {
  client_id: string
  coverage_tier: CoverageTier
  prediction_confidence: number
  dishes_count: number
  // Sprint S-MENU Day 3.2 (15.05.2026) — 'restaumatic_menu' added на top
  // priority (highest data quality: JSON-LD structured, $0 cost, sectioned).
  dishes_source:
    | 'restaumatic_menu'
    | 'www_menu'
    | 'wedo_pdf_menu'
    | 'gmaps_menu'
    | 'subtype_default'
  volume: VolumePrediction
  ingredients: AggregatedIngredient[]
  ai_calls_made: number
  ai_total_cost_usd: number
  prediction_id?: string  // ID after save до menu_predictions
}

interface MenuDish {
  name_pl: string
  price_pln: number | null
  category: string | null
  description: string | null
}

interface MenuEnrichmentRow {
  source: string
  status: string | null
  raw_payload: { dishes?: MenuDish[]; restaurant_name?: string } | null
  enriched_at: string | null
}

interface ClientRow {
  id: string
  title: string | null
  city: string | null
  region: string | null
  registered_date: string | null
  business_profile: {
    client_type?: string
    client_subtype?: string
    estimated_locations?: number | null
  } | null
}

interface ApifyGmapsRow {
  gmaps_rating: number | null
  gmaps_reviews_count: number | null
  raw_payload: unknown
}

/** Map client_subtype → cuisine_type label for dish_ingredient_mappings cache. */
function subtypeToCuisine(subtype: RestaurantSubtype): string {
  switch (subtype) {
    case 'sushi_bar': return 'sushi'
    case 'pizzeria': return 'pizza'
    case 'kebabnia': return 'kebab'
    case 'bar_mleczny': return 'polska'
    case 'kawiarnia': return 'kawiarnia'
    case 'fine_dining': return 'fine_dining'
    case 'restauracja': return 'restauracja'
    default: return 'inne'
  }
}

/** Main entry — aggregate ingredient prediction для client. */
export async function aggregateMonthlyIngredients(
  supabase: SupabaseClient,
  clientId: string,
  anthropicKey: string,
): Promise<{ prediction: AggregatedPrediction | null; error?: string }> {
  // ─── 1. Fetch client + business_profile ───
  // Sprint S6D Day 4 BUGFIX (12.05.2026) — removed `location_count` з SELECT
  // (column doesn't exist on clients table — confirmed via information_schema
  // query). Use business_profile.estimated_locations from JSONB instead.
  const { data: clientRaw, error: clientErr } = await supabase
    .from('clients')
    .select('id, title, city, region, registered_date, business_profile')
    .eq('id', clientId)
    .single()
  if (clientErr || !clientRaw) {
    return { prediction: null, error: `client fetch: ${clientErr?.message ?? 'not found'}` }
  }
  const client = clientRaw as ClientRow
  const profile = client.business_profile ?? {}
  if (profile.client_type !== 'gastronomia') {
    return { prediction: null, error: `client_type=${profile.client_type ?? '(null)'} — prediction tylko для gastronomia` }
  }

  // ─── 2. Fetch Apify GMaps row (reviews + rating) ───
  const { data: gmapsRaw } = await supabase
    .from('contact_enrichment')
    .select('gmaps_rating, gmaps_reviews_count, raw_payload')
    .eq('target_id', clientId)
    .eq('target_type', 'client')
    .eq('source', 'apify_gmaps')
    .maybeSingle()
  const gmaps = (gmapsRaw ?? null) as ApifyGmapsRow | null

  // ─── 3. Fetch menu enrichment rows ───
  // Sprint S-MENU Day 3.2 (15.05.2026) — added 'restaumatic_menu' до filter.
  // Restaumatic JSON-LD = highest priority (zero AI cost, structured prices
  // + descriptions + sections, ~70+ dishes typical у Polish gastronomy).
  const { data: menuRawsRaw } = await supabase
    .from('contact_enrichment')
    .select('source, status, raw_payload, enriched_at')
    .eq('target_id', clientId)
    .eq('target_type', 'client')
    .in('source', ['restaumatic_menu', 'www_menu', 'wedo_pdf_menu', 'gmaps_menu'])
    .order('enriched_at', { ascending: false })
  const menuRows = ((menuRawsRaw ?? []) as unknown) as MenuEnrichmentRow[]

  // Pick best menu source (priority order)
  // Sprint S-MENU Day 3.2 — restaumaticRow на top (Restaumatic > wedo > www > gmaps)
  const restaumaticRow = menuRows.find((r) => r.source === 'restaumatic_menu' && (r.raw_payload?.dishes?.length ?? 0) > 0)
  const wedoRow = menuRows.find((r) => r.source === 'wedo_pdf_menu' && (r.raw_payload?.dishes?.length ?? 0) > 0)
  const wwwRow = menuRows.find((r) => r.source === 'www_menu' && (r.raw_payload?.dishes?.length ?? 0) > 0)
  // Fallback gmaps_menu з apify_gmaps row (raw_payload.best.menu may be array)
  let gmapsDishes: MenuDish[] = []
  const gmapsBest =
    (gmaps?.raw_payload as { best?: { menu?: unknown } } | null)?.best?.menu
  if (Array.isArray(gmapsBest)) {
    gmapsDishes = (gmapsBest as Array<{ name?: string; price?: number | string; description?: string }>)
      .filter((d) => typeof d.name === 'string' && d.name.trim())
      .map((d) => {
        const priceN =
          typeof d.price === 'number'
            ? d.price
            : typeof d.price === 'string'
              ? parseFloat(d.price.replace(/[^\d,.\-]/g, '').replace(',', '.'))
              : null
        return {
          name_pl: d.name!.trim(),
          price_pln: priceN && Number.isFinite(priceN) ? priceN : null,
          category: null,
          description: d.description ?? null,
        }
      })
  }

  let chosenDishes: MenuDish[] = []
  let dishesSource: AggregatedPrediction['dishes_source'] = 'subtype_default'
  // Sprint S-MENU Day 3.2 (15.05.2026) — restaumaticRow checked FIRST.
  // Highest quality: JSON-LD structured price+description+section, no AI.
  if (restaumaticRow) {
    chosenDishes = restaumaticRow.raw_payload?.dishes ?? []
    dishesSource = 'restaumatic_menu'
  } else if (wedoRow) {
    chosenDishes = wedoRow.raw_payload?.dishes ?? []
    dishesSource = 'wedo_pdf_menu'
  } else if (wwwRow) {
    chosenDishes = wwwRow.raw_payload?.dishes ?? []
    dishesSource = 'www_menu'
  } else if (gmapsDishes.length > 0) {
    chosenDishes = gmapsDishes
    dishesSource = 'gmaps_menu'
  }

  const dishesCount = chosenDishes.length
  const coverage_tier: CoverageTier =
    dishesCount > FULL_MENU_THRESHOLD
      ? 'full_menu'
      : dishesCount > 0
        ? 'popular_only'
        : 'subtype_only'

  // ─── 4. Compute volume prediction ───
  // Sprint S6D Day 4 BUGFIX — derive location_count від business_profile
  // .estimated_locations JSONB field (clients.location_count column не existуючий).
  const locationCount =
    typeof profile.estimated_locations === 'number' && profile.estimated_locations > 0
      ? profile.estimated_locations
      : 1
  const months_since_open = calculateMonthsSinceOpen(client.registered_date)
  const volume = calculateMonthlyVolume({
    client_type: 'gastronomia',
    client_subtype: profile.client_subtype ?? null,
    reviews_count: gmaps?.gmaps_reviews_count ?? 0,
    rating: gmaps?.gmaps_rating ?? 0,
    months_since_open,
    city: client.city,
    voivodeship: client.region,
    location_count: locationCount,
  })

  // ─── 5. Aggregate ingredients per tier ───
  const cuisine = subtypeToCuisine(volume.subtype_used)
  const aggregatedMap = new Map<string, {
    name: string
    grams_low: number
    grams_mid: number
    grams_high: number
    contributing_count: number
    confidence_sum: number
  }>()

  let ai_calls = 0
  let ai_total_cost = 0

  if (coverage_tier === 'subtype_only') {
    // No menu data — use SUBTYPE_INGREDIENT_DEFAULTS distribution
    const defaults = SUBTYPE_INGREDIENT_DEFAULTS[volume.subtype_used] ?? SUBTYPE_INGREDIENT_DEFAULTS.inne
    for (const ing of defaults) {
      const servings_with_ingredient = volume.visits_mid * ing.popularity
      const grams_mid = servings_with_ingredient * ing.grams_per_visit
      aggregatedMap.set(ing.name_normalized, {
        name: ing.name,
        grams_low: grams_mid * LOW_MULTIPLIER,
        grams_mid,
        grams_high: grams_mid * HIGH_MULTIPLIER,
        contributing_count: 1,
        confidence_sum: 0.5,
      })
    }
  } else {
    // full_menu OR popular_only — extract ingredients from real dishes
    const popularity_share = 1 / Math.max(1, chosenDishes.length)  // uniform
    for (const dish of chosenDishes) {
      const lookup = await getDishIngredients(supabase, dish.name_pl, cuisine, anthropicKey)
      if (lookup.ai_cost_usd > 0) {
        ai_calls += 1
        ai_total_cost += lookup.ai_cost_usd
      }
      const monthly_servings = volume.visits_mid * popularity_share
      for (const ing of lookup.ingredients) {
        const grams_per_serving = ing.grams
        const grams_mid = monthly_servings * grams_per_serving
        const key = ing.name_normalized
        const existing = aggregatedMap.get(key)
        if (existing) {
          existing.grams_mid += grams_mid
          existing.grams_low += grams_mid * LOW_MULTIPLIER
          existing.grams_high += grams_mid * HIGH_MULTIPLIER
          existing.contributing_count += 1
          existing.confidence_sum += ing.confidence
        } else {
          aggregatedMap.set(key, {
            name: ing.name,
            grams_low: grams_mid * LOW_MULTIPLIER,
            grams_mid,
            grams_high: grams_mid * HIGH_MULTIPLIER,
            contributing_count: 1,
            confidence_sum: ing.confidence,
          })
        }
      }
    }
  }

  // Convert до kg + sort by mid descending
  const ingredients: AggregatedIngredient[] = Array.from(aggregatedMap.entries())
    .map(([norm, agg]) => ({
      name: agg.name,
      name_normalized: norm,
      kg_low: Math.round((agg.grams_low / 1000) * 10) / 10,
      kg_mid: Math.round((agg.grams_mid / 1000) * 10) / 10,
      kg_high: Math.round((agg.grams_high / 1000) * 10) / 10,
      source_dish_count: agg.contributing_count,
      avg_confidence: agg.contributing_count > 0
        ? Math.round((agg.confidence_sum / agg.contributing_count) * 100) / 100
        : 0.5,
    }))
    .sort((a, b) => b.kg_mid - a.kg_mid)

  const prediction: AggregatedPrediction = {
    client_id: clientId,
    coverage_tier,
    prediction_confidence: PREDICTION_CONFIDENCE[coverage_tier],
    dishes_count: dishesCount,
    dishes_source: dishesSource,
    volume,
    ingredients,
    ai_calls_made: ai_calls,
    ai_total_cost_usd: Math.round(ai_total_cost * 10000) / 10000,
  }

  // ─── 6. Save до menu_predictions для history audit ───
  const ingredients_kg: Record<string, number> = {}
  for (const ing of ingredients) ingredients_kg[ing.name] = ing.kg_mid

  const { data: inserted } = await supabase
    .from('menu_predictions')
    .insert({
      client_id: clientId,
      source_data: {
        reviews_count: gmaps?.gmaps_reviews_count ?? 0,
        rating: gmaps?.gmaps_rating ?? null,
        months_since_open,
        client_type: 'gastronomia',
        client_subtype: profile.client_subtype ?? null,
        dishes_count: dishesCount,
        dishes_source: dishesSource,
        coverage_tier,
        city: client.city,
        voivodeship: client.region,
        location_count: locationCount,
      },
      formula_version: volume.formula_version,
      formula_params: volume.formula_params,
      prediction: {
        customers_low: volume.customers_low,
        customers_mid: volume.customers_mid,
        customers_high: volume.customers_high,
        visits_mid: volume.visits_mid,
        ingredients_kg,
        confidence: prediction.prediction_confidence,
      },
    })
    .select('id')
    .single()
  if (inserted) {
    prediction.prediction_id = (inserted as { id: string }).id
  }

  return { prediction }
}
