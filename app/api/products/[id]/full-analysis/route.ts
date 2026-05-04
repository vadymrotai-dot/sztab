// app/api/products/[id]/full-analysis/route.ts
// Sprint S-CORE.3.A α' — "Analiza produktu" CTA на /produkty detail panel.
//
// Mirror /api/ai/analyze-profile pattern (direct AI call, NOT lookup wrapper)
// бо products не мають NIP-based enrichment workflow analogous до clients.
//
// Flow:
//   1. Auth + UUID validate
//   2. SELECT product з products WHERE id=X
//   3. SELECT params.anthropic_api_key
//   4. Quick: count + TOP-3 matches WHERE product_id=X (per Q2)
//   5. Build user prompt z product-analysis template + JSON schema instruction
//   6. startEnrichmentRun (telemetry, target_type='product' per migration 057)
//   7. callAI (Sonnet 4.6 per template)
//   8. extractJSON safety net + manual structure validation (per Q5, без zod)
//   9. UPDATE products SET business_profile=X, last_analyzed_at=now()
//   10. finishEnrichmentRun (success/error)
//   11. Return { ok, profile, cost_usd }
//
// PRECONDITIONS:
//   - Migration 057 applied (adds business_profile + last_analyzed_at +
//     extends enrichment_log CHECK to allow target_type='product')
//   - params.anthropic_api_key set
//
// Cost: ~$0.05-0.10 per call (Sonnet 4.6, ~1500 output tokens, ~30-60s).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callAI, AI_MODELS, extractJSON } from '@/lib/ai-providers'
import {
  startEnrichmentRun,
  finishEnrichmentRun,
} from '@/lib/profile/enrichment-log'
import { productAnalysisTemplate } from '@/lib/intelligence-engine/core/ai-prompt-templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

// ─── AI output JSON shape (manual validate per Q5) ──────────────

interface AIOutputShape {
  segments?: { hot?: string; warm?: string; cold?: string }
  pitch_per_segment?: { hot?: string; warm?: string; cold?: string }
  next_steps?: unknown
}

// ─── Stored business_profile shape (mirrors interface у component) ─

interface ProductBusinessProfile {
  segments: { hot: string; warm: string; cold: string }
  pitch_per_segment: { hot: string; warm: string; cold: string }
  next_steps: string[]
  analyzed_at: string
  model_used: string
  cost_usd: number
  input_context: {
    product_name: string
    sku: string
    price_pln: number | null
    category: string | null
    total_clients: string
    top_matches: string
  }
}

// ─── Handler ────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Nieautoryzowany' },
      { status: 401 },
    )
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json(
      { ok: false, error: 'Niepoprawny product id (oczekiwany UUID)' },
      { status: 400 },
    )
  }

  // 1. Resolve product
  const { data: productRow, error: productErr } = await supabase
    .from('products')
    .select(
      'id, name, ean, category, brand, cn_code, cost_pln, price_maly_opt, price_duzy, vat_rate, hygiene_status, vertical',
    )
    .eq('id', id)
    .maybeSingle()
  if (productErr) {
    return NextResponse.json(
      { ok: false, error: `DB error (products): ${productErr.message}` },
      { status: 500 },
    )
  }
  const product = productRow as {
    id: string
    name: string
    ean: string | null
    category: string | null
    brand: string | null
    cn_code: string | null
    cost_pln: number | null
    price_maly_opt: number | null
    price_duzy: number | null
    vat_rate: number | null
    hygiene_status: string | null
    vertical: string | null
  } | null
  if (!product) {
    return NextResponse.json(
      { ok: false, error: 'Produkt nie istnieje' },
      { status: 404 },
    )
  }

  // 2. Anthropic API key
  const { data: paramsRow } = await supabase
    .from('params')
    .select('anthropic_api_key')
    .limit(1)
    .maybeSingle()
  const anthropicKey =
    (paramsRow as { anthropic_api_key?: string } | null)?.anthropic_api_key ??
    ''
  if (!anthropicKey) {
    return NextResponse.json(
      { ok: false, error: 'anthropic_api_key missing у params' },
      { status: 500 },
    )
  }

  // 3. Quick matches stats (per Q2 — show value у MVP без full TOP-25)
  const { count: totalClients } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', id)

  const { data: topMatchesData } = await supabase
    .from('matches')
    .select(
      'combined_score, ai_score, algo_score, clients:clients(id, title, segment)',
    )
    .eq('product_id', id)
    .order('combined_score', { ascending: false, nullsFirst: false })
    .limit(3)

  type TopMatchRow = {
    combined_score: number | null
    ai_score: number | null
    algo_score: number | null
    clients:
      | { id: string; title: string; segment: string | null }
      | { id: string; title: string; segment: string | null }[]
      | null
  }
  const topMatchesArr = (topMatchesData ?? []) as TopMatchRow[]

  const topMatchesText =
    topMatchesArr.length > 0
      ? topMatchesArr
          .map((m) => {
            const c = Array.isArray(m.clients) ? m.clients[0] : m.clients
            if (!c) return null
            const score = m.combined_score ?? m.algo_score
            return `${c.title} (segment: ${c.segment ?? '—'}, score: ${score ?? '?'})`
          })
          .filter((s): s is string => s !== null)
          .join('; ')
      : 'Niedostępne — uruchom matching у S-CORE.3.B'

  const totalClientsText =
    totalClients !== null && totalClients !== undefined && totalClients > 0
      ? String(totalClients)
      : 'Niedostępne — uruchom matching у S-CORE.3.B'

  // 4. Build user prompt z product-analysis template + JSON schema instruction
  const skuLabel = product.ean ?? product.id.slice(0, 8)
  const userPromptCore = productAnalysisTemplate.user_template
    .replaceAll('{{product_name}}', product.name)
    .replaceAll('{{sku}}', skuLabel)
    .replaceAll('{{price_pln}}', String(product.cost_pln ?? '?'))
    .replaceAll('{{category}}', product.category ?? '—')
    .replaceAll('{{total_clients}}', totalClientsText)
    .replaceAll('{{top_matches}}', topMatchesText)

  const jsonSchemaInstruction = `

WAŻNE: Odpowiedz strukturowanym JSON dokładnie w tej formie (po polsku):
{
  "segments": {
    "hot": "krótki opis segmentu hot (1 zdanie, kto i dlaczego)",
    "warm": "krótki opis segmentu warm",
    "cold": "krótki opis segmentu cold"
  },
  "pitch_per_segment": {
    "hot": "pełny pitch (1 paragraf 3-5 zdań) dla segmentu hot",
    "warm": "pełny pitch dla segmentu warm",
    "cold": "pełny pitch dla segmentu cold"
  },
  "next_steps": ["krok 1 (konkretne action)", "krok 2", "krok 3"]
}

Tylko ten JSON, bez markdown fences, bez wstępu.`

  const userPrompt = userPromptCore + jsonSchemaInstruction

  // 5. Telemetry start (target_type='product' per migration 057 CHECK extension)
  const runId = await startEnrichmentRun(supabase, {
    target_type: 'product',
    target_id: id,
    source: 'AI_product_analysis',
  })

  const startedAt = Date.now()

  // 6. Call Claude
  const aiResult = await callAI({
    apiKey: anthropicKey,
    provider: 'anthropic',
    model: AI_MODELS.BALANCED, // Sonnet 4.6 per productAnalysisTemplate.model
    systemPrompt: productAnalysisTemplate.system,
    userPrompt,
    responseFormat: 'json',
    maxTokens: productAnalysisTemplate.max_tokens,
  })

  if (aiResult.error || !aiResult.text) {
    const errMsg = aiResult.error ?? 'Claude returned empty response'
    await finishEnrichmentRun(supabase, runId, {
      status: 'error',
      error_message: errMsg,
    })
    return NextResponse.json(
      { ok: false, error: errMsg },
      { status: 500 },
    )
  }

  // 7. Parse + validate (per Q5 — manual без zod)
  let parsed: AIOutputShape
  try {
    parsed = extractJSON<AIOutputShape>(aiResult.text)
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
    await finishEnrichmentRun(supabase, runId, {
      status: 'error',
      error_message: `JSON parse failed: ${msg}`,
      raw_payload: { ai_text_preview: aiResult.text.slice(0, 2000) },
    })
    return NextResponse.json(
      { ok: false, error: `AI JSON parse error: ${msg}` },
      { status: 500 },
    )
  }

  const segments = parsed.segments ?? {}
  const pitch = parsed.pitch_per_segment ?? {}
  const nextStepsRaw = Array.isArray(parsed.next_steps)
    ? parsed.next_steps
    : []
  const nextSteps = nextStepsRaw.filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  )

  if (!segments.hot && !segments.warm && !segments.cold) {
    await finishEnrichmentRun(supabase, runId, {
      status: 'error',
      error_message: 'AI returned empty segments structure',
      raw_payload: parsed,
    })
    return NextResponse.json(
      { ok: false, error: 'AI returned empty segments structure' },
      { status: 500 },
    )
  }

  // 8. Cost estimate. callAI logs precise cost; aiResult.tokensUsed має sum.
  // Sonnet 4.6 pricing $3/$15 per 1M (input/output). Average mid-rate ~$9/1M
  // надає approximate estimate коли split не доступний.
  const tokens = aiResult.tokensUsed ?? productAnalysisTemplate.max_tokens
  const estCostUsd = Number(((tokens * 9) / 1_000_000).toFixed(4))

  // 9. Build profile object
  const businessProfile: ProductBusinessProfile = {
    segments: {
      hot: segments.hot ?? '',
      warm: segments.warm ?? '',
      cold: segments.cold ?? '',
    },
    pitch_per_segment: {
      hot: pitch.hot ?? '',
      warm: pitch.warm ?? '',
      cold: pitch.cold ?? '',
    },
    next_steps: nextSteps,
    analyzed_at: new Date().toISOString(),
    model_used: aiResult.model ?? AI_MODELS.BALANCED,
    cost_usd: estCostUsd,
    input_context: {
      product_name: product.name,
      sku: skuLabel,
      price_pln: product.cost_pln,
      category: product.category,
      total_clients: totalClientsText,
      top_matches: topMatchesText,
    },
  }

  // 10. UPDATE products
  const nowIso = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('products')
    .update({
      business_profile: businessProfile,
      last_analyzed_at: nowIso,
    })
    .eq('id', id)

  if (updateErr) {
    await finishEnrichmentRun(supabase, runId, {
      status: 'error',
      error_message: `UPDATE products failed: ${updateErr.message}`,
      raw_payload: businessProfile,
    })
    return NextResponse.json(
      { ok: false, error: `UPDATE failed: ${updateErr.message}` },
      { status: 500 },
    )
  }

  // 11. Telemetry success
  await finishEnrichmentRun(supabase, runId, {
    status: 'success',
    raw_payload: businessProfile,
    cost_usd: estCostUsd,
  })

  const durationMs = Date.now() - startedAt
  console.log(
    `[products/full-analysis] product=${id} model=${businessProfile.model_used} ` +
      `tokens=${tokens} cost=$${estCostUsd} duration=${durationMs}ms`,
  )

  return NextResponse.json({
    ok: true,
    profile: businessProfile,
    cost_usd: estCostUsd,
  })
}
