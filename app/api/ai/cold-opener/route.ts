// app/api/ai/cold-opener/route.ts
// Sprint P FIX 5 — generate cold opener для single client (calls Claude Haiku).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM = `Jesteś polskim B2B sprzedawcą firmy Czudowa Marka (ChM) — polski producent kiszonek, sałatek, marynat, buraków konserwowanych. Generujesz pierwsze 1-2 zdania cold-emaila do osoby decyzyjnej.

ZASADY:
- 1-2 zdania, MAX 250 znaków
- Język: polski (jeśli typowo polskie nazwisko) lub mix pl-ua dla ukraińskich/białoruskich nazwisk
- Personalizacja: branża/lokalizacja/produkt z portfolio ChM pasujący do top match
- Ton: konkretny, bez sprzedażowego żargonu
- Output: TYLKO sam tekst, bez podpisów ani nagłówków`

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 })

  let body: { clientId?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }
  const { clientId } = body
  if (!clientId)
    return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 })

  const { data: paramsRow } = await supabase
    .from('params')
    .select('anthropic_api_key')
    .limit(1)
    .maybeSingle()
  const anthropicKey = (paramsRow as { anthropic_api_key?: string } | null)?.anthropic_api_key
  if (!anthropicKey)
    return NextResponse.json(
      { ok: false, error: 'anthropic_api_key missing у params' },
      { status: 500 },
    )

  const { data: client } = await supabase
    .from('clients')
    .select('title, krs_legal_form, region, city, business_profile')
    .eq('id', clientId)
    .single()
  const c = client as
    | {
        title: string
        krs_legal_form: string | null
        region: string | null
        city: string | null
        business_profile: { business_summary_pl?: string } | null
      }
    | null
  if (!c) return NextResponse.json({ ok: false, error: 'client not found' }, { status: 404 })

  // Top match
  const { data: topMatch } = await supabase
    .from('matches')
    .select('product_id, combined_score, products(name, family_id, taxonomy_families(name_pl))')
    .eq('client_id', clientId)
    .order('combined_score', { ascending: false })
    .limit(1)
    .maybeSingle()
  const tm = topMatch as
    | {
        product_id: string
        combined_score: number
        products: {
          name: string
          family_id: string
          taxonomy_families: { name_pl: string } | { name_pl: string }[] | null
        } | { name: string; family_id: string; taxonomy_families: { name_pl: string } | { name_pl: string }[] | null }[] | null
      }
    | null

  const prod = Array.isArray(tm?.products) ? tm?.products[0] : tm?.products
  const tf = prod?.taxonomy_families
  const familyNamePl = Array.isArray(tf) ? tf[0]?.name_pl : tf?.name_pl

  const prompt = [
    `Firma: ${c.title}`,
    c.krs_legal_form && `Forma: ${c.krs_legal_form}`,
    c.region && `Region: ${c.region}`,
    c.city && `Miasto: ${c.city}`,
    c.business_profile?.business_summary_pl &&
      `Profil: ${c.business_profile.business_summary_pl}`,
    prod && `Top match: ${prod.name} (rodzina: ${familyNamePl ?? '?'})`,
    '',
    'Wygeneruj 1-2 zdania cold-emaila.',
  ]
    .filter(Boolean)
    .join('\n')

  const anthropic = new Anthropic({ apiKey: anthropicKey })
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })
    const opener = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim()

    const cost =
      resp.usage.input_tokens / 1_000_000 + (resp.usage.output_tokens * 5) / 1_000_000

    // Persist
    await supabase.from('cohort_cold_openers').insert({
      client_id: clientId,
      product_id: prod ? tm?.product_id : null,
      family_id: prod?.family_id ?? null,
      opener_text: opener,
      language: 'pl',
      model_used: MODEL,
      cost_usd: cost,
    })

    return NextResponse.json({ ok: true, opener, cost_usd: cost })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'AI fail' },
      { status: 500 },
    )
  }
}
