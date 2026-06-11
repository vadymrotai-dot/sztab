// lib/predictions/dish-ingredients.ts
// Sprint S6D Day 4 (12.05.2026) — AI-cached dish → ingredient breakdown.
//
// Strategy:
//   1. Normalize dish_name (lowercase, deaccent, strip punctuation).
//   2. DB lookup dish_ingredient_mappings WHERE (dish_name_normalized,
//      cuisine_type) — exact match.
//   3. Якщо exists → return cached.
//   4. Якщо not exists → AI Haiku 4.5 extract, save до DB
//      (created_by='ai_haiku', validation_status='unvalidated').
//   5. Caller (aggregate-ingredients.ts) multiplies grams × monthly_servings.
//
// Cost: ~$0.002 per новий dish (Haiku ~500 tokens). Cache hit = $0 для
// repeat dishes (Margherita, Maki California, Doner Kebab common).
//
// Polish deaccent map covers: ą→a, ć→c, ę→e, ł→l, ń→n, ó→o, ś→s, ź→z, ż→z.

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAI, AI_MODELS, extractJSON } from '@/lib/ai-providers'

const AI_PROMPT_VERSION = 'v1.0'

export interface DishIngredient {
  name: string
  name_normalized: string
  grams: number
  source: 'ai' | 'manual'
  confidence: number
}

export interface DishIngredientLookup {
  dish_name_pl: string
  dish_name_normalized: string
  cuisine_type: string
  ingredients: DishIngredient[]
  cached: boolean
  ai_cost_usd: number
  error?: string
}

// ─── Polish text normalization ───
const POLISH_DEACCENT: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n',
  ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n',
  Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
}

export function normalizeDishName(raw: string): string {
  return raw
    .toLowerCase()
    .split('')
    .map((ch) => POLISH_DEACCENT[ch] ?? ch)
    .join('')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim()
}

export function normalizeIngredientName(raw: string): string {
  return normalizeDishName(raw)
}

// ─── AI extraction ───
const SYSTEM_PROMPT = `Jesteś polskim szefem kuchni. Twoje zadanie: rozbić pozycję menu na surowe składniki potrzebne do przygotowania jednej porcji.

ZASADY:
1. Wymień TYLKO surowe składniki (nie przetworzone potrawy — np. dla "Kebab z kurczaka" zwróć kurczak/lavash/sałata/pomidor/cebula/sos, NIE "kebab").
2. Gramaż za jedną typową porcję (np. mała pizza Margherita: mąka 150g, pomidor 80g, mozarella 100g).
3. Confidence 0.9+ = pewna receptura (Margherita, Schabowy, Pierogi ruskie); 0.6-0.8 = znana ale z wariantami; 0.4 = niepewne.
4. Polski kontekst:
   - "Kebab" w PL = standardowo kurczak або wołowina+jagnięcina (NIE czysta jagnięcina як na Bliskim Wschodzie)
   - "Sushi/Maki" = ryż sushi + nori + nadzienie (łosoś/tuńczyk/ogórek)
   - "Pizza" = ciasto pizzy + sos pomidorowy + mozarella + dodatki
5. NIE dodawaj wody, soli, pieprzu jako składników — domyślne, не cost-relevant для distribution.
6. Skup się на ingredients що Vadym продає: świeże warzywa, kiszonki, ryby, мід, słodycze, wędliny.

Output JSON shape:
{
  "ingredients": [
    { "name": "łosoś atlantycki", "grams": 80, "confidence": 0.95 },
    { "name": "ryż sushi", "grams": 60, "confidence": 0.95 }
  ]
}`

interface AiOutput {
  ingredients?: Array<{
    name?: string
    grams?: number
    confidence?: number
  }>
}

async function extractViaAi(
  apiKey: string,
  dishNamePl: string,
  cuisineType: string,
): Promise<{ ingredients: DishIngredient[]; cost_usd: number; error?: string }> {
  if (!apiKey) {
    return { ingredients: [], cost_usd: 0, error: 'ANTHROPIC_API_KEY missing' }
  }
  const userPrompt = `Pozycja menu: ${dishNamePl}\nKuchnia: ${cuisineType}\n\nZADANIE: Zwróć JSON {ingredients: [...]}`

  const ai = await callAI({
    apiKey,
    provider: 'anthropic',
    model: AI_MODELS.FAST,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 600,
    temperature: 0.2,
  })

  if (ai.error || !ai.text) {
    return { ingredients: [], cost_usd: 0, error: `AI: ${ai.error ?? 'empty response'}` }
  }

  // Approximate cost (Haiku 4.5 ~$1 in / $5 out per 1M tokens).
  const tokens = ai.tokensUsed ?? 800
  const cost_usd =
    Math.round(((tokens * 0.5 * 1.0 + tokens * 0.5 * 5.0) / 1_000_000) * 10000) /
    10000

  try {
    const parsed = extractJSON<AiOutput>(ai.text)
    const raw = Array.isArray(parsed.ingredients) ? parsed.ingredients : []
    const ingredients: DishIngredient[] = raw
      .filter((i) => i && typeof i.name === 'string' && i.name.trim())
      .map((i) => ({
        name: i.name!.trim(),
        name_normalized: normalizeIngredientName(i.name!),
        grams: typeof i.grams === 'number' && Number.isFinite(i.grams) && i.grams > 0 ? i.grams : 0,
        source: 'ai' as const,
        confidence:
          typeof i.confidence === 'number' && i.confidence >= 0 && i.confidence <= 1
            ? i.confidence
            : 0.5,
      }))
      .filter((i) => i.grams > 0)  // skip zero-gram items
    return { ingredients, cost_usd }
  } catch (err) {
    return {
      ingredients: [],
      cost_usd,
      error: `AI parse: ${err instanceof Error ? err.message : err}`,
    }
  }
}

// ─── Batch extraction (Fix 12.06 — render nie liczy; compute w paczkach) ───
// Zamiast 127 sekwencyjnych Haiku (śmierć trasy) — paczki ~30 dań w 1 call.

const BATCH_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

WEJŚCIE: lista pozycji menu. Dla KAŻDEJ pozycji zwróć jej składniki.
OUTPUT JSON: { "dishes": [ { "name": "<dokładna nazwa wejściowa>", "ingredients": [ {"name","grams","confidence"} ] } ] }`

async function extractBatchViaAi(
  apiKey: string,
  dishNames: string[],
  cuisineType: string,
): Promise<{ perDish: Map<string, DishIngredient[]>; cost_usd: number; error?: string }> {
  const perDish = new Map<string, DishIngredient[]>()
  if (!apiKey || dishNames.length === 0) {
    return { perDish, cost_usd: 0, error: !apiKey ? 'ANTHROPIC_API_KEY missing' : undefined }
  }
  const list = dishNames.map((d, i) => `${i + 1}. ${d}`).join('\n')
  const userPrompt = `Kuchnia: ${cuisineType}\n\nPozycje menu:\n${list}\n\nZADANIE: Zwróć JSON {dishes:[{name, ingredients:[...]}]} dla KAŻDEJ pozycji.`
  const ai = await callAI({
    apiKey,
    provider: 'anthropic',
    model: AI_MODELS.FAST,
    systemPrompt: BATCH_SYSTEM_PROMPT,
    userPrompt,
    // ~30 dań × ~120 tokenów + bufor; salvage łapie obcięcie.
    maxTokens: 8000,
    temperature: 0.2,
  })
  const tokens = ai.tokensUsed ?? 6000
  const cost_usd =
    Math.round(((tokens * 0.5 * 1.0 + tokens * 0.5 * 5.0) / 1_000_000) * 10000) / 10000
  if (ai.error || !ai.text) {
    return { perDish, cost_usd: 0, error: `AI: ${ai.error ?? 'empty response'}` }
  }
  // Parse z salvage (jak website-menu) — odzysk z obciętego JSON.
  let dishesArr: Array<{ name?: string; ingredients?: Array<{ name?: string; grams?: number; confidence?: number }> }> = []
  try {
    const parsed = extractJSON<{ dishes?: typeof dishesArr }>(ai.text)
    dishesArr = Array.isArray(parsed.dishes) ? parsed.dishes : []
  } catch {
    const objs = ai.text.match(/\{[^{}]*"name"[^{}]*"ingredients"[\s\S]*?\]\s*\}/g) ?? []
    for (const o of objs) {
      try {
        dishesArr.push(JSON.parse(o))
      } catch {
        /* pomiń niepełny */
      }
    }
  }
  for (const d of dishesArr) {
    if (!d?.name) continue
    const ings: DishIngredient[] = (Array.isArray(d.ingredients) ? d.ingredients : [])
      .filter((i) => i && typeof i.name === 'string' && i.name.trim())
      .map((i) => ({
        name: i.name!.trim(),
        name_normalized: normalizeIngredientName(i.name!),
        grams: typeof i.grams === 'number' && Number.isFinite(i.grams) && i.grams > 0 ? i.grams : 0,
        source: 'ai' as const,
        confidence:
          typeof i.confidence === 'number' && i.confidence >= 0 && i.confidence <= 1 ? i.confidence : 0.5,
      }))
      .filter((i) => i.grams > 0)
    perDish.set(d.name.trim(), ings)
  }
  return { perDish, cost_usd }
}

/**
 * Batchowy odpowiednik getDishIngredients — cache-check wszystkich, miss-y
 * w paczkach ~30 dań/call, zapis przyrostowy po każdej paczce (idempotentny
 * insert ON CONFLICT). Zwraca mapę dish_name_normalized → ingredients.
 */
export async function getDishIngredientsBatch(
  supabase: SupabaseClient,
  dishNamesPl: string[],
  cuisineType: string,
  anthropicKey: string,
): Promise<{ map: Map<string, DishIngredient[]>; ai_calls: number; ai_cost_usd: number }> {
  const cuisine = cuisineType.toLowerCase().trim() || 'inne'
  const map = new Map<string, DishIngredient[]>()
  // norm → original (dedup po normalizacji)
  const normToOrig = new Map<string, string>()
  for (const d of dishNamesPl) {
    const n = normalizeDishName(d)
    if (n && !normToOrig.has(n)) normToOrig.set(n, d)
  }
  const norms = [...normToOrig.keys()]

  // 1. Batch cache lookup
  const cachedSet = new Set<string>()
  for (let i = 0; i < norms.length; i += 200) {
    const slice = norms.slice(i, i + 200)
    const { data: rows } = await supabase
      .from('dish_ingredient_mappings')
      .select('dish_name_normalized, ingredients')
      .eq('cuisine_type', cuisine)
      .in('dish_name_normalized', slice)
    for (const r of (rows ?? []) as Array<{ dish_name_normalized: string; ingredients: DishIngredient[] }>) {
      map.set(r.dish_name_normalized, Array.isArray(r.ingredients) ? r.ingredients : [])
      cachedSet.add(r.dish_name_normalized)
    }
  }

  // 2. Miss-y w paczkach po 30, zapis przyrostowy
  const misses = norms.filter((n) => !cachedSet.has(n))
  let ai_calls = 0
  let ai_cost = 0
  const BATCH = 30
  for (let i = 0; i < misses.length; i += BATCH) {
    const chunkNorms = misses.slice(i, i + BATCH)
    const chunkOrig = chunkNorms.map((n) => normToOrig.get(n)!)
    const { perDish, cost_usd } = await extractBatchViaAi(anthropicKey, chunkOrig, cuisine)
    ai_calls += 1
    ai_cost += cost_usd
    const inserts: Array<Record<string, unknown>> = []
    for (const n of chunkNorms) {
      const orig = normToOrig.get(n)!
      const ings = perDish.get(orig) ?? perDish.get(orig.trim()) ?? []
      map.set(n, ings)
      if (ings.length > 0) {
        inserts.push({
          dish_name_pl: orig,
          dish_name_normalized: n,
          cuisine_type: cuisine,
          ingredients: ings,
          created_by: 'ai_haiku',
          ai_model: 'claude-haiku-4-5',
          ai_prompt_version: AI_PROMPT_VERSION,
          validation_status: 'unvalidated',
        })
      }
    }
    if (inserts.length > 0) {
      try {
        await supabase.from('dish_ingredient_mappings').insert(inserts)
      } catch {
        /* best-effort, idempotentny — duplikaty pomijane */
      }
    }
  }
  return { map, ai_calls, ai_cost_usd: Math.round(ai_cost * 10000) / 10000 }
}

// ─── Public entry ───
/**
 * Get dish ingredient breakdown — DB cache hit first, AI Haiku fallback.
 * Saves AI results до dish_ingredient_mappings table з
 * validation_status='unvalidated'.
 *
 * @param supabase — Supabase client (server-side, з RLS context)
 * @param dishNamePl — Polish dish name as displayed у menu
 * @param cuisineType — 'sushi' | 'pizza' | 'polska' | 'kebab' | 'kawiarnia' | 'inne'
 * @param anthropicKey — для AI fallback (optional — якщо absent, return empty з error)
 */
export async function getDishIngredients(
  supabase: SupabaseClient,
  dishNamePl: string,
  cuisineType: string,
  anthropicKey: string,
): Promise<DishIngredientLookup> {
  const dish_name_normalized = normalizeDishName(dishNamePl)
  const cuisine = cuisineType.toLowerCase().trim() || 'inne'

  // Step 1: DB cache lookup
  const { data: cached, error: lookupErr } = await supabase
    .from('dish_ingredient_mappings')
    .select('ingredients')
    .eq('dish_name_normalized', dish_name_normalized)
    .eq('cuisine_type', cuisine)
    .maybeSingle()

  if (lookupErr) {
    // Soft fail — continue to AI but log
    console.warn('[dish-ingredients] DB lookup error:', lookupErr.message)
  }

  if (cached?.ingredients && Array.isArray(cached.ingredients)) {
    return {
      dish_name_pl: dishNamePl,
      dish_name_normalized,
      cuisine_type: cuisine,
      ingredients: cached.ingredients as DishIngredient[],
      cached: true,
      ai_cost_usd: 0,
    }
  }

  // Step 2: AI fallback
  const aiResult = await extractViaAi(anthropicKey, dishNamePl, cuisine)
  if (aiResult.error || aiResult.ingredients.length === 0) {
    return {
      dish_name_pl: dishNamePl,
      dish_name_normalized,
      cuisine_type: cuisine,
      ingredients: aiResult.ingredients,
      cached: false,
      ai_cost_usd: aiResult.cost_usd,
      error: aiResult.error,
    }
  }

  // Step 3: Cache до DB (best-effort, не fail caller якщо insert fails).
  // ON CONFLICT (dish_name_normalized, cuisine_type) DO NOTHING — race-safe.
  const { error: insertErr } = await supabase
    .from('dish_ingredient_mappings')
    .insert({
      dish_name_pl: dishNamePl,
      dish_name_normalized,
      cuisine_type: cuisine,
      ingredients: aiResult.ingredients,
      created_by: 'ai_haiku',
      ai_model: 'claude-haiku-4-5',
      ai_prompt_version: AI_PROMPT_VERSION,
      validation_status: 'unvalidated',
    })
  if (insertErr && !insertErr.message.includes('duplicate')) {
    console.warn('[dish-ingredients] DB insert error:', insertErr.message)
  }

  return {
    dish_name_pl: dishNamePl,
    dish_name_normalized,
    cuisine_type: cuisine,
    ingredients: aiResult.ingredients,
    cached: false,
    ai_cost_usd: aiResult.cost_usd,
  }
}
