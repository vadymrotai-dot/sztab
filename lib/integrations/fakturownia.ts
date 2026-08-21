/**
 * Fakturownia API client.
 *
 * Docs: https://app.fakturownia.pl/api
 * GitHub: https://github.com/fakturownia/API
 *
 * Auth: api_token у kazdom request body (POST/PUT) або як query param (GET/DELETE).
 * Base URL: https://${SUBDOMAIN}.fakturownia.pl
 *
 * Seller info: DAGOLD Sp. z o.o. (NIP 5214088667) — береться з дефолту акаунта
 * Fakturownia (per-invoice override заблокований security). Акаунт DAGOLD задано
 * через env FAKTUROWNIA_SUBDOMAIN + FAKTUROWNIA_API_TOKEN.
 * - KSeF wymagana czyste data
 *
 * Sprint S-ORDER.2.A.2 (19.05.2026).
 */

import 'server-only'

const SUBDOMAIN = process.env.FAKTUROWNIA_SUBDOMAIN
const API_TOKEN = process.env.FAKTUROWNIA_API_TOKEN
// Ф1 — id складu Fakturownia (magazyn). Один склад, задається у env.
export const WAREHOUSE_ID = process.env.FAKTUROWNIA_WAREHOUSE_ID || ''

if (!SUBDOMAIN || !API_TOKEN) {
  console.warn(
    '[fakturownia] Missing FAKTUROWNIA_SUBDOMAIN or FAKTUROWNIA_API_TOKEN — API client буде failing',
  )
}

// Захист від кривого env: приймаємо як 'dagold', так і повний URL / зі слешем.
const CLEAN_SUBDOMAIN = (SUBDOMAIN || '')
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/+$/, '')
  .replace(/\.fakturownia\.pl.*$/i, '')
const BASE_URL = CLEAN_SUBDOMAIN ? `https://${CLEAN_SUBDOMAIN}.fakturownia.pl` : ''

// S-ORDER.2.A.2.1 (19.05.2026): seller_* fields removed.
// Fakturownia security ("Poziom zabezpieczenia przed zmianą konta bankowego")
// blocks per-invoice seller override → uses account-default seller automatically.
// Seller config managed у Fakturownia dashboard (DAGOLD Sp. z o.o.,
// NIP 5214088667, ul. Wyględowska 8/51, 02-654 Warszawa).

export type FakturowniaPosition = {
  name: string
  quantity: number
  unit?: string
  total_price_gross?: number
  total_price_net?: number
  tax: number // % VAT (5 для CzM, 23 для general)
  code?: string // PKWiU/EAN/product code
  product_id?: number // Ф3 — Fakturownia product id (powiązanie magazynowe → списання stanu)
}

export type FakturowniaBuyer = {
  name: string
  tax_no?: string | null
  street?: string | null
  post_code?: string | null
  city?: string | null
  email?: string | null
  phone?: string | null
  country?: string | null
}

export type CreateInvoiceInput = {
  kind: 'proforma' | 'vat'
  buyer: FakturowniaBuyer
  positions: FakturowniaPosition[]
  payment_to_days?: number // дні до termin platnosci
  description?: string // uwagi/notes
  external_order_id?: string // ZIO-2026-XXXX
  send_to_ksef?: boolean // дефолт true для VAT після Feb 2026
  // Ф3 — magazyn: gdy podane, Fakturownia liczy fakturę do stanów (WZ, списання).
  warehouse_id?: string | number
  exclude_from_stock_level?: boolean // true → NIE zmniejsza stanu (np. proforma)
}

export type FakturowniaInvoice = {
  id: number
  number: string
  kind: string
  view_url: string
  payment_url?: string
  pdf_url?: string
  total_price_gross: string | number
  total_price_net: string | number
  total_tax: string | number
  issue_date: string
  payment_to: string
  buyer_name: string
  buyer_tax_no?: string
  oid?: string
  status?: string
  gov_status?: string // KSeF status
}

/**
 * Create invoice (proforma або VAT) у Fakturownia.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<FakturowniaInvoice> {
  if (!BASE_URL || !API_TOKEN) {
    throw new Error(
      'Fakturownia не сконфігуровано (FAKTUROWNIA_SUBDOMAIN/TOKEN відсутні)',
    )
  }

  const isVAT = input.kind === 'vat'
  const sendToKsef = input.send_to_ksef ?? isVAT // дефолт: send VAT до KSeF, не proforma

  // S-ORDER.2.A.2.1 — compute payment_to as ISO date (Fakturownia rejects payment_to_days field)
  const paymentToDays = input.payment_to_days ?? 14
  const paymentToDate = new Date()
  paymentToDate.setDate(paymentToDate.getDate() + paymentToDays)
  const paymentToISO = paymentToDate.toISOString().split('T')[0]

  const body = {
    api_token: API_TOKEN,
    gov_save_and_send: sendToKsef,
    invoice: {
      kind: input.kind === 'vat' ? 'vat' : 'proforma',

      // Ф3 magazyn — warehouse_id → списання stanu (WZ auto). exclude_from_stock_level
      // dla dokumentów nie-sprzedażowych (proforma).
      ...(input.warehouse_id ? { warehouse_id: input.warehouse_id } : {}),
      ...(input.exclude_from_stock_level != null
        ? { exclude_from_stock_level: input.exclude_from_stock_level }
        : {}),

      // Seller: uses Fakturownia account default (security blocks per-invoice override)

      // Buyer
      buyer_name: input.buyer.name,
      buyer_tax_no: input.buyer.tax_no || null,
      buyer_street: input.buyer.street || null,
      buyer_post_code: input.buyer.post_code || null,
      buyer_city: input.buyer.city || null,
      buyer_country: input.buyer.country || 'PL',
      buyer_email: input.buyer.email || null,
      buyer_phone: input.buyer.phone || null,
      buyer_company: input.buyer.tax_no ? true : false,

      // Payment terms
      payment_to: paymentToISO,
      payment_type: 'transfer',

      // Notes
      description: input.description || null,
      oid: input.external_order_id || null,

      // Positions — Fakturownia requires total_price_gross.
      // Якщо callee passed total_price_net, обчислюємо gross = net × (1 + tax/100).
      // S-ORDER.2.A.3.1: unit field name is `quantity_unit` (НЕ `unit` чи `unit_name`).
      // Per Fakturownia API: position.quantity_unit зберігається + рендериться на PDF
      // у колонці "j.m." (jednostka miary). Без цього показує "(brak)".
      positions: input.positions.map((p) => {
        const grossPrice =
          p.total_price_gross !== undefined
            ? p.total_price_gross
            : p.total_price_net !== undefined
              ? Math.round(p.total_price_net * (1 + p.tax / 100) * 100) / 100
              : 0
        return {
          name: p.name,
          quantity: p.quantity,
          quantity_unit: p.unit || 'szt',
          tax: p.tax,
          total_price_gross: grossPrice,
          ...(p.code ? { code: p.code } : {}),
          ...(p.product_id ? { product_id: p.product_id } : {}),
        }
      }),
    },
  }

  const res = await fetch(`${BASE_URL}/invoices.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    console.error('[fakturownia] createInvoice failed', {
      status: res.status,
      data,
    })
    throw new Error(`Fakturownia error ${res.status}: ${JSON.stringify(data)}`)
  }

  return data as FakturowniaInvoice
}

/**
 * Get PDF bytes для existing invoice.
 */
export async function getInvoicePdf(invoiceId: number): Promise<Buffer> {
  if (!BASE_URL || !API_TOKEN) {
    throw new Error('Fakturownia не сконфігуровано')
  }
  const res = await fetch(
    `${BASE_URL}/invoices/${invoiceId}.pdf?api_token=${API_TOKEN}`,
    { method: 'GET' },
  )
  if (!res.ok) {
    throw new Error(`Fakturownia PDF fetch failed: ${res.status}`)
  }
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Get full invoice details by ID (для re-fetch updated data, after payment etc).
 */
export async function getInvoice(
  invoiceId: number,
): Promise<FakturowniaInvoice> {
  if (!BASE_URL || !API_TOKEN) {
    throw new Error('Fakturownia не сконфігуровано')
  }
  const res = await fetch(
    `${BASE_URL}/invoices/${invoiceId}.json?api_token=${API_TOKEN}`,
    { method: 'GET' },
  )
  const data = await res.json()

  if (!res.ok) {
    throw new Error(`Fakturownia getInvoice failed: ${res.status}`)
  }

  return data as FakturowniaInvoice
}

// 3B-1 — typ pozycji wejściowej (z order_items + vat_rate z products).
type OrderItemForDoc = {
  product_id?: string | null
  product_name_snapshot: string
  gramatura_snapshot: string | null
  qty: number
  unit_price: number | string
  line_total: number | string
  // vat_rate ułamek (0.05 / 0.23). NULL → fallback 5% (Czudowa Marka).
  vat_rate?: number | string | null
  // Ф3 — Fakturownia product id (dla powiązania magazynowego na fakturze).
  fakturownia_product_id?: number | null
}

/**
 * Convert ZIO-order items → Fakturownia positions z VAT PER POZYCJA.
 * 3B-1 — tax liczony z vat_rate produktu (0.23→23, 0.05→5), NIE hardcode 5%.
 * Caller передає raw items z order_items + vat_rate (z products).
 */
export function orderItemsToPositions(
  items: OrderItemForDoc[],
): FakturowniaPosition[] {
  return items.map((item) => {
    const name = item.gramatura_snapshot
      ? `${item.product_name_snapshot} (${item.gramatura_snapshot})`
      : item.product_name_snapshot

    // 3B-1 — VAT per pozycja: vat_rate ułamek → procent. NULL → 5% (CzM fallback).
    const ratePct =
      item.vat_rate == null ? 5 : Math.round(Number(item.vat_rate) * 100)

    return {
      name,
      quantity: item.qty,
      unit: 'szt',
      total_price_net: Number(item.line_total), // line_total = net price для qty
      tax: ratePct,
      ...(item.fakturownia_product_id
        ? { product_id: Number(item.fakturownia_product_id) }
        : {}),
    }
  })
}

/**
 * 3B-1 — łączenie pozycji po product_id dla dokumentu WSPÓLNEGO.
 * Ten sam produkt z różnych punktów dostawy (multipoint) → JEDNA pozycja
 * z sumą qty i line_total. vat_rate/name/gramatura/unit_price identyczne dla
 * product_id (snapshot), więc bierzemy z pierwszego wystąpienia.
 * Bez product_id (legacy) → fallback klucz nazwa|gramatura.
 */
export function mergeItemsByProduct<T extends OrderItemForDoc>(items: T[]): T[] {
  const byKey = new Map<string, T>()
  for (const it of items) {
    const key =
      it.product_id ??
      `${it.product_name_snapshot}|${it.gramatura_snapshot ?? ''}`
    const prev = byKey.get(key)
    if (prev) {
      byKey.set(key, {
        ...prev,
        qty: prev.qty + it.qty,
        line_total: Number(prev.line_total) + Number(it.line_total),
      })
    } else {
      byKey.set(key, { ...it, line_total: Number(it.line_total) })
    }
  }
  return [...byKey.values()]
}

// ─────────────────────── Magazyn (warehouse) — Ф1 ───────────────────────
// Товар Fakturownia = складський запис (limited:1). code = Sztab product id
// (стабільний ключ матчингу). Залишок веде Fakturownia; Sztab читає stock_level.

export type FakturowniaWarehouse = { id: number; name: string; kind?: string | null }

// Список складів (заодно перевірка, що модуль Magazyn активний).
export async function listWarehouses(): Promise<FakturowniaWarehouse[]> {
  if (!BASE_URL || !API_TOKEN) throw new Error('Fakturownia не сконфігуровано')
  const res = await fetch(`${BASE_URL}/warehouses.json?api_token=${API_TOKEN}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Fakturownia warehouses ${res.status}: ${JSON.stringify(data)}`)
  }
  const arr = Array.isArray(data) ? data : []
  return arr.map((w: any) => ({
    id: Number(w.id),
    name: String(w.name ?? ''),
    kind: w.kind ?? null,
  }))
}

export type FakturowniaProductInput = {
  code: string // = Sztab product id
  name: string
  ean_code?: string | null
  tax: number // % VAT (5 / 23)
  unit?: string | null // quantity_unit
  purchase_price_net?: number | null // cost_pln
  price_net?: number | null // cena A (тільки при create)
}

function buildProductBody(input: FakturowniaProductInput, forCreate: boolean) {
  const p: Record<string, unknown> = {
    name: input.name,
    code: input.code,
    tax: input.tax,
    limited: 1, // складський контроль (веде stock_level)
  }
  if (input.ean_code) p.ean_code = input.ean_code
  if (input.unit) p.quantity_unit = input.unit
  if (input.purchase_price_net != null) p.purchase_price_net = input.purchase_price_net
  // price_net можна ставити лише при create — update забороняє редагувати net напряму.
  if (forCreate && input.price_net != null) p.price_net = input.price_net
  return p
}

// Створити складський товар. Повертає Fakturownia product id.
export async function createFakturowniaProduct(
  input: FakturowniaProductInput,
): Promise<number> {
  if (!BASE_URL || !API_TOKEN) throw new Error('Fakturownia не сконфігуровано')
  const res = await fetch(`${BASE_URL}/products.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ api_token: API_TOKEN, product: buildProductBody(input, true) }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Fakturownia createProduct ${res.status}: ${JSON.stringify(data)}`)
  }
  return Number((data as any).id)
}

// Оновити існуючий складський товар (без прямого редагування net-ціни).
export async function updateFakturowniaProduct(
  id: number,
  input: FakturowniaProductInput,
): Promise<void> {
  if (!BASE_URL || !API_TOKEN) throw new Error('Fakturownia не сконфігуровано')
  const res = await fetch(`${BASE_URL}/products/${id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ api_token: API_TOKEN, product: buildProductBody(input, false) }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(`Fakturownia updateProduct ${res.status}: ${JSON.stringify(data)}`)
  }
}

// Читання залишків складу: Map<code, stock_level>. code = Sztab product id.
export async function getWarehouseStock(
  warehouseId: string | number,
): Promise<Map<string, number>> {
  if (!BASE_URL || !API_TOKEN) throw new Error('Fakturownia не сконфігуровано')
  const out = new Map<string, number>()
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(
      `${BASE_URL}/products.json?api_token=${API_TOKEN}&warehouse_id=${warehouseId}&page=${page}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    const data = await res.json()
    if (!res.ok) {
      throw new Error(`Fakturownia stock ${res.status}: ${JSON.stringify(data)}`)
    }
    const arr = Array.isArray(data) ? data : []
    if (arr.length === 0) break
    for (const p of arr as any[]) {
      if (p.code != null && p.stock_level != null) {
        out.set(String(p.code), Number(p.stock_level))
      }
    }
  }
  return out
}

// ─────────────────── Dokument magazynowy PZ (przyjęcie) — Ф3 ───────────────────
// PZ dodaje stan magazynowy (goods receipt z faktury zakupowej). quantity > 0.
// purchase_price_net — koszt jednostkowy w PLN (wycena magazynowa).

export type WarehousePZLine = {
  product_id: number // Fakturownia product id
  quantity: number
  purchase_price_net?: number | null // PLN
  name?: string
}

export async function createWarehousePZ(input: {
  warehouseId: string | number
  clientId?: number // kontrahent-dostawca (wymagany przez Fakturownia dla PZ)
  issueDate?: string // YYYY-MM-DD
  description?: string
  lines: WarehousePZLine[]
}): Promise<{ id: number; number: string }> {
  if (!BASE_URL || !API_TOKEN) throw new Error('Fakturownia не сконфігуровано')
  const body = {
    api_token: API_TOKEN,
    warehouse_document: {
      kind: 'pz',
      warehouse_id: input.warehouseId,
      ...(input.clientId ? { client_id: input.clientId } : {}),
      issue_date: input.issueDate ?? new Date().toISOString().split('T')[0],
      ...(input.description ? { description: input.description } : {}),
      warehouse_actions: input.lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        ...(l.purchase_price_net != null
          ? { purchase_price_net: l.purchase_price_net }
          : {}),
      })),
    },
  }
  const res = await fetch(`${BASE_URL}/warehouse_documents.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Fakturownia PZ ${res.status}: ${JSON.stringify(data)}`)
  }
  return { id: Number((data as any).id), number: String((data as any).number ?? '') }
}

// Створити контрагента (kontrahent) у Fakturownia — потрібен як dostawca для PZ.
export async function createFakturowniaClient(input: {
  name: string
  tax_no?: string | null
  country?: string | null
}): Promise<number> {
  if (!BASE_URL || !API_TOKEN) throw new Error('Fakturownia не сконфігуровано')
  const res = await fetch(`${BASE_URL}/clients.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      api_token: API_TOKEN,
      client: {
        name: input.name,
        ...(input.tax_no ? { tax_no: input.tax_no } : {}),
        ...(input.country ? { country: input.country } : {}),
      },
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Fakturownia createClient ${res.status}: ${JSON.stringify(data)}`)
  }
  return Number((data as any).id)
}
