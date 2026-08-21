// app/api/fakturownia/import/parse/route.ts — Ф3.1
// POST { supplier_id, file_base64, mime_type } → розбір фактури (AI) + матч по
// аліасах + список товарів постачальника для випадайки. Auth required.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parsePurchaseInvoice } from '@/lib/ai/parse-purchase-invoice'
import {
  getAliasMap,
  getSupplierProducts,
  aiMatchExternalNames,
} from '@/lib/orders/purchase-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Zły format' }, { status: 400 })
  }
  const supplierId = String(body.supplier_id || '')
  const fileB64 = String(body.file_base64 || '')
  const mime = String(body.mime_type || '')
  if (!supplierId || !fileB64 || !mime) {
    return NextResponse.json(
      { ok: false, error: 'Brak supplier_id / pliku / typu' },
      { status: 400 },
    )
  }

  // klucz Claude — params.anthropic_api_key → env fallback
  const admin = createAdminClient()
  const { data: params } = await admin
    .from('params')
    .select('anthropic_api_key')
    .limit(1)
    .maybeSingle()
  const apiKey =
    (params as { anthropic_api_key?: string } | null)?.anthropic_api_key ||
    process.env.ANTHROPIC_API_KEY ||
    ''
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'Brak klucza Claude API (params.anthropic_api_key)' },
      { status: 400 },
    )
  }

  try {
    const invoice = await parsePurchaseInvoice({
      apiKey,
      fileBase64: fileB64,
      mimeType: mime,
    })
    const aliases = await getAliasMap(supplierId)
    const supplierProducts = await getSupplierProducts(supplierId)

    // AI крос-мовний матч для позицій без аліаса (перший імпорт від постачальника).
    const needAi = invoice.lines
      .filter((l) => !l.is_service && !aliases.get(norm(l.name)))
      .map((l) => l.name)
    let aiMatches = new Map<string, string>()
    if (needAi.length > 0) {
      aiMatches = await aiMatchExternalNames(
        apiKey,
        needAi,
        supplierProducts.map((p) => ({ id: p.id, name: p.name })),
      )
    }

    const lines = invoice.lines.map((l) => ({
      ...l,
      suggested_product_id: aliases.get(norm(l.name)) ?? aiMatches.get(l.name) ?? null,
    }))
    return NextResponse.json({
      ok: true,
      invoice: {
        supplier_name: invoice.supplier_name,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        currency: invoice.currency,
      },
      lines,
      supplier_products: supplierProducts,
    })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Parse error' },
      { status: 502 },
    )
  }
}
