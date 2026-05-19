/**
 * Fakturownia API client.
 *
 * Docs: https://app.fakturownia.pl/api
 * GitHub: https://github.com/fakturownia/API
 *
 * Auth: api_token у kazdom request body (POST/PUT) або як query param (GET/DELETE).
 * Base URL: https://${SUBDOMAIN}.fakturownia.pl
 *
 * Ziomek Fish seller info HARDCODED, бо:
 * - Konfiguracja у Fakturownia може być змінена (хтось переименує firmu)
 * - Want gwarancję що на fakturze будe "Ziomek Fish Sp. z o.o." з NIP 5223239864
 * - KSeF wymagana czyste data
 *
 * Sprint S-ORDER.2.A.2 (19.05.2026).
 */

import 'server-only'

const SUBDOMAIN = process.env.FAKTUROWNIA_SUBDOMAIN
const API_TOKEN = process.env.FAKTUROWNIA_API_TOKEN

if (!SUBDOMAIN || !API_TOKEN) {
  console.warn(
    '[fakturownia] Missing FAKTUROWNIA_SUBDOMAIN or FAKTUROWNIA_API_TOKEN — API client буде failing',
  )
}

const BASE_URL = SUBDOMAIN ? `https://${SUBDOMAIN}.fakturownia.pl` : ''

// Seller info (Ziomek Fish) — hardcoded, НЕ з env, НЕ з Fakturownia konfiguracji
const SELLER = {
  seller_name: 'Ziomek Fish Sp. z o.o.',
  seller_tax_no: '5223239864',
  seller_street: 'ul. Szczęsna 26',
  seller_post_code: '02-454',
  seller_city: 'Warszawa',
  seller_country: 'PL',
  seller_bank_account: '', // TODO: get from Vadym якщо потрібно у proforma
}

export type FakturowniaPosition = {
  name: string
  quantity: number
  unit?: string
  total_price_gross?: number
  total_price_net?: number
  tax: number // % VAT (5 для CzM, 23 для general)
  code?: string // PKWiU/EAN/product code
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

  const body = {
    api_token: API_TOKEN,
    gov_save_and_send: sendToKsef,
    invoice: {
      kind: input.kind === 'vat' ? 'vat' : 'proforma',

      // Seller (hardcoded)
      ...SELLER,

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
      payment_to_days: input.payment_to_days ?? 14,
      payment_type: 'transfer',

      // Notes
      description: input.description || null,
      oid: input.external_order_id || null,

      // Positions
      positions: input.positions.map((p) => ({
        name: p.name,
        quantity: p.quantity,
        unit: p.unit || 'szt',
        tax: p.tax,
        ...(p.total_price_gross !== undefined
          ? { total_price_gross: p.total_price_gross }
          : {}),
        ...(p.total_price_net !== undefined
          ? { total_price_net: p.total_price_net }
          : {}),
        ...(p.code ? { code: p.code } : {}),
      })),
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

/**
 * Convert ZIO-order items до Fakturownia positions з proper VAT (5% для CzM).
 * Caller передає raw items з order_items table.
 */
export function orderItemsToPositions(
  items: Array<{
    product_name_snapshot: string
    gramatura_snapshot: string | null
    qty: number
    unit_price: number | string
    line_total: number | string
  }>,
): FakturowniaPosition[] {
  return items.map((item) => {
    const name = item.gramatura_snapshot
      ? `${item.product_name_snapshot} (${item.gramatura_snapshot})`
      : item.product_name_snapshot

    return {
      name,
      quantity: item.qty,
      unit: 'szt',
      total_price_net: Number(item.line_total), // line_total = net price для qty
      tax: 5, // Czudowa Marka VAT
    }
  })
}
