// app/api/fakturownia/import/commit/route.ts — Ф3.1
// POST CommitInput → створення/матч товарів + PZ (додає залишок) + оновлення
// закупної ціни + аліаси. НЕ чіпає ціну продажу. Auth required.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { commitPurchaseImport, type CommitInput } from '@/lib/orders/purchase-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

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

  if (!body.supplier_id || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Brak supplier_id / pozycji' },
      { status: 400 },
    )
  }

  const input: CommitInput = {
    supplierId: String(body.supplier_id),
    invoiceNumber: body.invoice_number ?? null,
    invoiceDate: body.invoice_date ?? null,
    currency: String(body.currency || 'PLN'),
    rateToPln: Number(body.rate_to_pln) || 1,
    createdBy: user.id,
    lines: body.lines.map((l: any) => ({
      external_name: String(l.external_name || ''),
      external_ean: l.external_ean ?? null,
      unit: l.unit ?? null,
      qty: Number(l.qty) || 0,
      unit_price: l.unit_price != null ? Number(l.unit_price) : null,
      action: l.action === 'new' ? 'new' : l.action === 'skip' ? 'skip' : 'match',
      product_id: l.product_id ?? null,
      new_name: l.new_name ?? null,
      new_vat_rate: l.new_vat_rate != null ? Number(l.new_vat_rate) : null,
    })),
  }

  try {
    const result = await commitPurchaseImport(input)
    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Commit error' },
      { status: 502 },
    )
  }
}
