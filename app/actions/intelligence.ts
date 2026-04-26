'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import {
  runFastLookup,
  type FastLookupInput,
  type FastLookupResult,
} from '@/lib/ai/intelligence'
import type { AIProvider } from '@/lib/ai-providers'

export interface IntelligenceRunSummary {
  id: string
  run_type: 'fast_lookup' | 'deep_discovery' | 'partner_analysis'
  target_type: 'product' | 'category' | 'supplier' | 'client'
  target_id: string
  target_snapshot: unknown
  status: 'pending' | 'running' | 'completed' | 'failed'
  parsed_results: FastLookupResult | null
  raw_response: unknown
  results_count: number
  duration_ms: number | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

const RATE_LIMIT_WINDOW_MS = 60_000

type SupplierJoin = { name: string } | { name: string }[] | null

function pickSupplierName(s: SupplierJoin): string {
  if (!s) return 'unknown'
  if (Array.isArray(s)) return s[0]?.name ?? 'unknown'
  return s.name ?? 'unknown'
}

export async function startFastLookupForProduct(productId: string): Promise<{
  runId: string
  result: FastLookupResult
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sesja wygasła. Zaloguj się ponownie.')

  // Rate limit: max 1 currently-running analysis per owner. Window: 60s
  // (jeśli ktoś zostawi failed/completed po stronie servera — nadal
  // można startować nowe). Filtrujemy po status='running' explicitly.
  const { data: recentRuns } = await supabase
    .from('intelligence_runs')
    .select('id, status, created_at')
    .eq('owner_id', user.id)
    .gte(
      'created_at',
      new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString(),
    )

  if (recentRuns?.some((r) => r.status === 'running')) {
    throw new Error('Inna analiza jest w trakcie. Poczekaj chwilę.')
  }

  // Fetch product with supplier name (PostgREST may return supplier as
  // single object or single-element array depending on FK introspection).
  const { data: product, error: productError } = await supabase
    .from('products')
    .select(
      'id, name, category, gramatura, cost_pln, push_tier, tags, supplier:suppliers(name)',
    )
    .eq('id', productId)
    .single()

  if (productError || !product) {
    throw new Error('Produkt nie znaleziony')
  }

  // Read API key from params row (re-using pattern from existing
  // /api/ai/* routes — params is single-row settings table).
  const { data: paramsRow } = await supabase
    .from('params')
    .select('gemini_key, anthropic_key, openrouter_key')
    .single()

  const provider: AIProvider = paramsRow?.gemini_key
    ? 'gemini'
    : paramsRow?.anthropic_key
      ? 'anthropic'
      : 'openrouter'
  const apiKey =
    (provider === 'gemini' && paramsRow?.gemini_key) ||
    (provider === 'anthropic' && paramsRow?.anthropic_key) ||
    (provider === 'openrouter' && paramsRow?.openrouter_key) ||
    ''

  if (!apiKey) {
    throw new Error('Brak klucza API. Dodaj klucz Gemini w Ustawieniach.')
  }

  const supplierName = pickSupplierName(
    (product as { supplier: SupplierJoin }).supplier,
  )

  const input: FastLookupInput = {
    product: {
      id: product.id as string,
      name: product.name as string,
      category: (product.category as string | null) ?? null,
      gramatura: (product.gramatura as string | null) ?? null,
      supplier_name: supplierName,
      cost_pln: (product.cost_pln as number | null) ?? null,
      push_tier: (product.push_tier as number | null) ?? null,
      tags: (product.tags as string[] | null) ?? null,
    },
    context: {
      geo: 'mazowieckie',
      exclude_chains: [
        'Biedronka',
        'Lidl',
        'Auchan',
        'Carrefour',
        'Tesco',
        'Kaufland',
      ],
    },
  }

  // Insert run row with status=running BEFORE the AI call, so even if
  // the call hangs/crashes there is a record + dashboard pokaże
  // "running" → potem "failed". Bez tego mielibyśmy ghost runs niewidoczne
  // dla user-a.
  const { data: run, error: insertError } = await supabase
    .from('intelligence_runs')
    .insert({
      owner_id: user.id,
      run_type: 'fast_lookup',
      target_type: 'product',
      target_id: productId,
      target_snapshot: product,
      status: 'running',
    })
    .select('id')
    .single()

  if (insertError || !run) {
    throw new Error(
      `Nie udało się zarejestrować analizy: ${insertError?.message ?? 'unknown'}`,
    )
  }

  try {
    const { result, raw_response, prompt_text, duration_ms } =
      await runFastLookup(input, apiKey, provider)

    await supabase
      .from('intelligence_runs')
      .update({
        status: 'completed',
        prompt_text,
        parsed_results: result,
        raw_response,
        results_count: result.buyer_segments?.length ?? 0,
        duration_ms,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id)

    revalidatePath(`/products/${productId}/edit`)
    revalidatePath('/intelligence')

    return { runId: run.id as string, result }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    const message = error.message
    // Vercel logs ten console.error — bez tego production widzi
    // tylko zgenerowany "specific message omitted in production"
    // i nie da się zdiagnozować truncation vs auth vs network.
    console.error('[intelligence] startFastLookupForProduct failed', {
      productId,
      runId: run.id,
      message,
      stack: error.stack,
    })
    await supabase
      .from('intelligence_runs')
      .update({
        status: 'failed',
        error_message: message.slice(0, 1000),
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id)

    revalidatePath('/intelligence')
    // Clean Polish message dla UI (toast). Truncated → konkret, inne →
    // zachowujemy treść (max 200 znaków) żeby Vadym widział co się stało.
    const userMessage = /truncat/i.test(message)
      ? 'Odpowiedź AI była zbyt długa — spróbuj ponownie'
      : `Analiza nieudana: ${message.slice(0, 200)}`
    throw new Error(userMessage)
  }
}

export async function getIntelligenceRunsForProduct(
  productId: string,
): Promise<IntelligenceRunSummary[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('intelligence_runs')
    .select(
      'id, run_type, target_type, target_id, target_snapshot, status, parsed_results, raw_response, results_count, duration_ms, error_message, created_at, completed_at',
    )
    .eq('target_type', 'product')
    .eq('target_id', productId)
    .order('created_at', { ascending: false })
    .limit(10)

  return (data ?? []) as IntelligenceRunSummary[]
}

export async function listIntelligenceRuns(
  filter?: { target_type?: 'product' | 'category' | 'supplier' | 'client' },
): Promise<IntelligenceRunSummary[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  let q = supabase
    .from('intelligence_runs')
    .select(
      'id, run_type, target_type, target_id, target_snapshot, status, parsed_results, raw_response, results_count, duration_ms, error_message, created_at, completed_at',
    )
    .order('created_at', { ascending: false })
    .limit(50)

  if (filter?.target_type) {
    q = q.eq('target_type', filter.target_type)
  }

  const { data } = await q
  return (data ?? []) as IntelligenceRunSummary[]
}
