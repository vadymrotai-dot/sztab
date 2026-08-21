/**
 * Import faktury zakupowej → magazyn (Ф3.1).
 *
 * matchByAliases: zewnętrzna nazwa (z faktury) → product_id, wg product_aliases
 *   (uczone: raz potwierdzone przez operatora, potem auto). Cross-język.
 * commitPurchaseImport: dla potwierdzonych linii — utwórz/dopasuj produkt Sztab,
 *   zapewnij produkt Fakturownia, zapisz alias, utwórz PZ (dodaje stan),
 *   zaktualizuj purchase_cost + stock_level. NIE dotyka ceny sprzedaży
 *   (cost_pln/marża) — to robi operator osobno.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  createFakturowniaProduct,
  createWarehousePZ,
  createFakturowniaClient,
  WAREHOUSE_ID,
} from '@/lib/integrations/fakturownia'
import { callAI, AI_MODELS, extractJSON } from '@/lib/ai-providers'

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

// Мапа аліасів постачальника: lower(external_name) → product_id.
export async function getAliasMap(
  supplierId: string,
): Promise<Map<string, string>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('product_aliases')
    .select('external_name, product_id')
    .eq('supplier_id', supplierId)
  const m = new Map<string, string>()
  for (const a of (data ?? []) as any[]) m.set(norm(a.external_name), a.product_id)
  return m
}

// Товари постачальника для випадайки в review.
export async function getSupplierProducts(supplierId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('products')
    .select('id, name, display_name, unit, vat_rate, fakturownia_product_id')
    .eq('supplier_id', supplierId)
    .order('name')
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.display_name || p.name,
    unit: p.unit,
    vat_rate: p.vat_rate,
    fakturownia_product_id: p.fakturownia_product_id,
  }))
}

// AI крос-мовний матчинг: назви з фактури (англ./łot.) → наш каталог (польські).
// Повертає Map<external_name, product_id> лише для впевнених збігів.
export async function aiMatchExternalNames(
  apiKey: string,
  externalNames: string[],
  catalog: { id: string; name: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!apiKey || externalNames.length === 0 || catalog.length === 0) return out

  const prompt = `Dopasuj pozycje z faktury zakupowej (nazwy w obcym języku — angielski/łotewski) do NASZEGO katalogu (nazwy polskie). To ten sam towar, tylko inny język/opis.

POZYCJE Z FAKTURY:
${externalNames.map((n, i) => `${i}: ${n}`).join('\n')}

NASZ KATALOG (product_id => nazwa):
${catalog.map((c) => `${c.id} => ${c.name}`).join('\n')}

Reguły:
- Dopasuj po znaczeniu: "Salted herring" → "Śledź ... solony"; "Mussels in oil" → "Mięso małży ..."; "GOLD SMOKED MACKEREL" → "Makrela ... wędzona".
- Tylko PEWNE dopasowania. Jeśli brak odpowiednika w katalogu → product_id null.
- Zwróć WYŁĄCZNIE JSON: {"matches":[{"i":0,"product_id":"<uuid>"|null}]}`

  const res = await callAI({
    apiKey,
    provider: 'anthropic',
    model: AI_MODELS.FAST,
    userPrompt: prompt,
    responseFormat: 'json',
    maxTokens: 1024,
  })
  if (res.error || !res.text) return out

  try {
    const parsed = extractJSON<{ matches?: { i: number; product_id: string | null }[] }>(
      res.text,
    )
    const valid = new Set(catalog.map((c) => c.id))
    for (const m of parsed.matches ?? []) {
      const nm = externalNames[m.i]
      if (nm && m.product_id && valid.has(m.product_id)) out.set(nm, m.product_id)
    }
  } catch {
    // AI не дав валідний JSON — повертаємо порожньо (fallback на ручний вибір)
  }
  return out
}

export type CommitLine = {
  external_name: string
  external_ean?: string | null
  unit?: string | null
  qty: number
  unit_price?: number | null // waluta źródłowa
  action: 'match' | 'new' | 'skip'
  product_id?: string | null // dla 'match'
  new_name?: string | null // dla 'new'
  new_vat_rate?: number | null // dla 'new' (0.05 / 0.23)
}

export type CommitInput = {
  supplierId: string
  invoiceNumber?: string | null
  invoiceDate?: string | null
  currency: string // 'EUR' | 'PLN' | ...
  rateToPln: number // 1 dla PLN
  lines: CommitLine[]
  createdBy?: string | null
}

export type CommitResult = {
  import_id: string
  pz_id: number | null
  pz_number: string | null
  created_products: number
  matched_products: number
  skipped: number
  errors: string[]
}

export async function commitPurchaseImport(
  input: CommitInput,
): Promise<CommitResult> {
  if (!WAREHOUSE_ID) throw new Error('FAKTUROWNIA_WAREHOUSE_ID не задано')
  const admin = createAdminClient()
  const rate = Number(input.rateToPln) || 1
  const isEur = (input.currency || '').toUpperCase() === 'EUR'

  const res: CommitResult = {
    import_id: '',
    pz_id: null,
    pz_number: null,
    created_products: 0,
    matched_products: 0,
    skipped: 0,
    errors: [],
  }

  // 1. Журнал імпорту
  const { data: imp, error: impErr } = await admin
    .from('purchase_imports')
    .insert({
      supplier_id: input.supplierId,
      invoice_number: input.invoiceNumber ?? null,
      invoice_date: input.invoiceDate ?? null,
      currency: input.currency,
      rate_to_pln: rate,
      status: 'draft',
      created_by: input.createdBy ?? null,
    })
    .select('id')
    .single()
  if (impErr || !imp) throw new Error(`purchase_imports insert: ${impErr?.message}`)
  res.import_id = imp.id

  const pzLines: {
    product_id: number
    quantity: number
    purchase_price_net?: number | null
    name?: string
  }[] = []
  const lineRows: any[] = []
  let totalValue = 0

  for (const l of input.lines) {
    if (l.action === 'skip' || l.qty <= 0) {
      res.skipped++
      continue
    }
    try {
      const priceSrc = l.unit_price != null ? Number(l.unit_price) : null
      const costPln = priceSrc != null ? Math.round(priceSrc * rate * 100) / 100 : null
      const costEur = isEur && priceSrc != null ? priceSrc : null

      // ── визначаємо Sztab product ──
      let productId: string
      let fakturowniaId: number | null = null
      let name: string
      let unit = l.unit || 'szt'
      let vat = 0.05

      if (l.action === 'new') {
        name = String(l.new_name || l.external_name).trim()
        vat = l.new_vat_rate != null ? Number(l.new_vat_rate) : 0.05
        const { data: np, error: npErr } = await admin
          .from('products')
          .insert({
            name,
            supplier_id: input.supplierId,
            unit,
            ean: l.external_ean ?? null,
            vat_rate: vat,
            show_in_orders: false, // не продається доки оператор не оцінить
            purchase_cost_pln: costPln,
            purchase_cost_eur: costEur,
            purchase_cost_updated_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (npErr || !np) throw new Error(`create product: ${npErr?.message}`)
        productId = np.id
        res.created_products++
      } else {
        // match
        if (!l.product_id) throw new Error('match bez product_id')
        productId = l.product_id
        const { data: ep } = await admin
          .from('products')
          .select('name, display_name, unit, vat_rate, fakturownia_product_id')
          .eq('id', productId)
          .single()
        name = (ep?.display_name || ep?.name || l.external_name) as string
        unit = (ep?.unit as string) || unit
        vat = ep?.vat_rate != null ? Number(ep.vat_rate) : 0.05
        fakturowniaId = ep?.fakturownia_product_id ? Number(ep.fakturownia_product_id) : null
        // оновити закупну ціну (НЕ продажну)
        await admin
          .from('products')
          .update({
            purchase_cost_pln: costPln,
            purchase_cost_eur: costEur,
            purchase_cost_updated_at: new Date().toISOString(),
          })
          .eq('id', productId)
        res.matched_products++
      }

      // ── зафіксувати товар у Fakturownia (якщо ще нема) ──
      if (!fakturowniaId) {
        fakturowniaId = await createFakturowniaProduct({
          code: productId,
          name,
          ean_code: l.external_ean ?? null,
          tax: Math.round(vat * 100),
          unit,
          purchase_price_net: costPln,
        })
        await admin
          .from('products')
          .update({ fakturownia_product_id: fakturowniaId })
          .eq('id', productId)
      }

      // ── зберегти аліас (крос-мовний матч на майбутнє) ──
      await admin
        .from('product_aliases')
        .upsert(
          {
            supplier_id: input.supplierId,
            external_name: l.external_name,
            external_ean: l.external_ean ?? null,
            product_id: productId,
          },
          { onConflict: 'supplier_id,external_name', ignoreDuplicates: true },
        )

      // ── PZ-рядок + локальний приріст залишку ──
      pzLines.push({
        product_id: fakturowniaId,
        quantity: l.qty,
        purchase_price_net: costPln,
        name,
      })
      if (costPln != null) totalValue += costPln * l.qty

      lineRows.push({
        import_id: imp.id,
        external_name: l.external_name,
        external_ean: l.external_ean ?? null,
        qty: l.qty,
        unit,
        price_src: priceSrc,
        purchase_cost_pln: costPln,
        product_id: productId,
        is_new: l.action === 'new',
      })
    } catch (e: any) {
      res.errors.push(`${l.external_name}: ${e?.message ?? e}`.slice(0, 200))
    }
  }

  if (lineRows.length) await admin.from('purchase_import_lines').insert(lineRows)

  // Ф3 — kontrahent-dostawca для PZ (Fakturownia вимагає client_id).
  let supplierClientId: number | undefined
  try {
    const { data: sup } = await admin
      .from('suppliers')
      .select('name, nip, country, fakturownia_client_id')
      .eq('id', input.supplierId)
      .maybeSingle()
    if ((sup as any)?.fakturownia_client_id) {
      supplierClientId = Number((sup as any).fakturownia_client_id)
    } else if ((sup as any)?.name) {
      supplierClientId = await createFakturowniaClient({
        name: (sup as any).name,
        tax_no: (sup as any).nip ?? null,
        country: (sup as any).country ?? null,
      })
      await admin
        .from('suppliers')
        .update({ fakturownia_client_id: supplierClientId })
        .eq('id', input.supplierId)
    }
  } catch (e: any) {
    res.errors.push(`kontrahent: ${e?.message ?? e}`.slice(0, 200))
  }

  // 2. PZ у Fakturownia (додає залишок)
  if (pzLines.length) {
    try {
      const pz = await createWarehousePZ({
        warehouseId: WAREHOUSE_ID,
        clientId: supplierClientId,
        issueDate: input.invoiceDate ?? undefined,
        description: `Import faktury ${input.invoiceNumber ?? ''}`.trim(),
        lines: pzLines,
      })
      res.pz_id = pz.id
      res.pz_number = pz.number
      // локальний приріст stock_level (Fakturownia = source of truth, тут кеш)
      for (const row of lineRows) {
        const { data: cur } = await admin
          .from('products')
          .select('stock_level')
          .eq('id', row.product_id)
          .single()
        const next = (cur?.stock_level == null ? 0 : Number(cur.stock_level)) + Number(row.qty)
        await admin
          .from('products')
          .update({ stock_level: next, stock_synced_at: new Date().toISOString() })
          .eq('id', row.product_id)
      }
    } catch (e: any) {
      res.errors.push(`PZ: ${e?.message ?? e}`.slice(0, 300))
    }
  }

  await admin
    .from('purchase_imports')
    .update({
      total_value: Math.round(totalValue * 100) / 100,
      fakturownia_pz_id: res.pz_id,
      status: res.pz_id ? 'committed' : 'error',
    })
    .eq('id', imp.id)

  return res
}
