// app/api/products/cn-suggest/route.ts
// Sprint S-INTEL.1.1 — POST endpoint що пропонує CN code (Combined
// Nomenclature, EU 8-digit) для product через Claude Haiku 4.5.
//
// Auth: supabase.auth.getUser → 401 якщо unauth
// Body: { name (required), category?, gramatura?, ean?, vertical?, brand?, product_id? }
// Response: { ok: true, suggestion } | { ok: false, error }
//
// Side-effect: якщо product_id present + suggestion.confidence ∈ {high, medium},
// одразу UPDATE products.cn_code + cn_code_review_pending = TRUE (Vadym save edit
// у ProductForm clears flag = quality gate per audit Section 6 Q5).

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import {
  suggestCnCode,
  CnCodeSuggesterError,
  type ProductInfo,
} from '@/lib/ai/cn-code-suggester'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BodySchema = z.object({
  product_id: z.string().uuid().optional(),
  name: z.string().min(1, 'Nazwa wymagana'),
  category: z.string().nullable().optional(),
  gramatura: z.string().nullable().optional(),
  ean: z.string().nullable().optional(),
  vertical: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
})

export async function POST(req: Request) {
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

  // Body parse + validate
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Bad JSON w body' },
      { status: 400 },
    )
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Niepoprawny payload',
      },
      { status: 400 },
    )
  }
  const body = parsed.data

  // Resolve Anthropic key з params (consistent з решта routes — cold-opener,
  // intelligence/lookup тощо).
  const { data: paramsRow } = await supabase
    .from('params')
    .select('anthropic_api_key')
    .limit(1)
    .maybeSingle()
  const anthropicKey =
    (paramsRow as { anthropic_api_key?: string } | null)?.anthropic_api_key ??
    process.env.ANTHROPIC_API_KEY ??
    ''
  if (!anthropicKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'anthropic_api_key missing. Uzupełnij Settings → Klucze API albo ENV ANTHROPIC_API_KEY.',
      },
      { status: 500 },
    )
  }

  // Build ProductInfo + call suggester
  const productInfo: ProductInfo = {
    name: body.name,
    category: body.category ?? null,
    gramatura: body.gramatura ?? null,
    ean: body.ean ?? null,
    vertical: body.vertical ?? null,
    brand: body.brand ?? null,
  }

  let suggestion
  try {
    suggestion = await suggestCnCode(anthropicKey, productInfo)
  } catch (err) {
    if (err instanceof CnCodeSuggesterError) {
      const status =
        err.kind === 'missing_key'
          ? 500
          : err.kind === 'invalid_format'
            ? 422
            : 502
      return NextResponse.json(
        { ok: false, error: err.message, kind: err.kind },
        { status },
      )
    }
    return NextResponse.json(
      {
        ok: false,
        error: `Unexpected: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    )
  }

  // Auto-write back до products якщо product_id passed AND confidence>=medium.
  // Low confidence — НЕ пишемо одразу, Vadym має manually прийняти.
  // Quality gate: ставимо cn_code_review_pending=TRUE — UI badge на /produkty.
  if (body.product_id && suggestion.confidence !== 'low') {
    const { error: updateErr } = await supabase
      .from('products')
      .update({
        cn_code: suggestion.cn_code,
        cn_code_review_pending: true,
      })
      .eq('id', body.product_id)
      .eq('owner_id', user.id)

    if (updateErr) {
      // Non-fatal — повертаємо suggestion навіть якщо write failed
      return NextResponse.json({
        ok: true,
        suggestion,
        warning: `Suggest OK, але DB update failed: ${updateErr.message}`,
      })
    }
  }

  return NextResponse.json({ ok: true, suggestion })
}
