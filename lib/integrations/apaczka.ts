/**
 * Apaczka API v2 client (3C-1).
 *
 * Własny klient w TypeScript (NIE PHP SDK). Bazuje na dokumentacji Apaczka API v2.
 *
 * Każdy request:
 *   POST https://www.apaczka.pl/api/v2/<route>
 *   form-urlencoded body: app_id, request (JSON string), expires (unix), signature
 *
 * Signature:
 *   HMAC-SHA256(key = APP_SECRET, data = stringToSign), hex
 *   stringToSign = `${appId}:${route}:${data}:${expires}`
 *   gdzie route = ścieżka endpointu BEZ base url, z trailing slash (np. "service_structure/")
 *         data  = ten sam JSON string co w polu `request`
 *   expires = unix timestamp, max +30 min od teraz (używamy now + 1800s)
 *
 * Response: JSON { status: 200|400, message: string, response: {...} }
 *   status !== 200 → rzucamy ApaczkaError z message.
 *
 * ENV:
 *   APACZKA_APP_ID     — id aplikacji (z panelu Apaczka → API)
 *   APACZKA_APP_SECRET — sekret aplikacji (HMAC key)
 */

import crypto from 'node:crypto'

const BASE_URL = 'https://www.apaczka.pl/api/v2/'
const EXPIRES_WINDOW_S = 1800 // +30 min (max dozwolone przez API)

export class ApaczkaError extends Error {
  constructor(
    message: string,
    public status: number,
    public route: string,
    public raw?: unknown,
  ) {
    super(message)
    this.name = 'ApaczkaError'
  }
}

// ─────────────────────────── Typy ───────────────────────────

export type ApaczkaResponse<T = unknown> = {
  status: number
  message: string
  response: T
}

export type Address = {
  name?: string
  line1?: string
  line2?: string
  postal_code?: string
  city?: string
  country_code?: string // 'PL'
  is_residential?: 0 | 1
  contact_person?: string
  email?: string
  phone?: string
  foreign_address_id?: string
}

export type Shipment = {
  dimension1?: number | string // dł (cm)
  dimension2?: number | string // szer (cm)
  dimension3?: number | string // wys (cm)
  weight?: number | string // kg
  is_nstd?: 0 | 1 // niestandardowa
  shipment_type_code?: string // np. 'PACZKA', 'PALETA'
  value?: number | string // wartość (ubezpieczenie)
  is_cod?: 0 | 1
  cod_amount?: number | string
  content?: string
  comment?: string
}

export type Pickup = {
  type?: 'COURIER' | 'SELF' // odbiór kurierem / nadanie własne
  date?: string // 'YYYY-MM-DD'
  hour_from?: string // 'HH:MM'
  hour_to?: string // 'HH:MM'
}

export type Order = {
  service_id: number | string
  address: {
    sender: Address
    receiver: Address
  }
  option?: Record<string, unknown>
  notification?: {
    value?: string
    type?: string
    events?: string[]
  }
  shipment?: Shipment[]
  shipment_value?: number | string
  pickup?: Pickup
  comment?: string
  content?: string
}

export type Service = {
  service_id: number | string
  name: string
  supplier?: string
  domestic?: 0 | 1
  package_type?: string
  pickup_type?: string
  delivery_type?: string
  [key: string]: unknown
}

export type ServiceStructure = {
  services?: Service[]
  [key: string]: unknown
}

export type ValuationPrice = {
  service_id?: number | string
  price?: number | string
  price_gross?: number | string
  price_net?: number | string
  tax?: number | string
  currency?: string
  [key: string]: unknown
}

export type ValuationResult = {
  price_table?: ValuationPrice[]
  [key: string]: unknown
}

// ─────────────────────────── Rdzeń ───────────────────────────

function readEnv(): { appId: string; appSecret: string } {
  const appId = process.env.APACZKA_APP_ID
  const appSecret = process.env.APACZKA_APP_SECRET
  if (!appId || !appSecret) {
    throw new ApaczkaError(
      'Brak APACZKA_APP_ID lub APACZKA_APP_SECRET w env',
      0,
      '(config)',
    )
  }
  return { appId, appSecret }
}

/**
 * HMAC-SHA256 podpis requestu.
 * stringToSign = `${appId}:${route}:${data}:${expires}`
 */
export function signature(
  route: string,
  data: string,
  expires: number,
  appId: string,
  appSecret: string,
): string {
  const stringToSign = `${appId}:${route}:${data}:${expires}`
  return crypto
    .createHmac('sha256', appSecret)
    .update(stringToSign, 'utf8')
    .digest('hex')
}

/**
 * Wykonuje zapytanie do Apaczka API v2.
 * @param route  ścieżka endpointu z trailing slash, np. "service_structure/"
 * @param dataObj  obiekt serializowany do pola `request`
 */
export async function apaczkaRequest<T = unknown>(
  route: string,
  dataObj: Record<string, unknown> = {},
): Promise<T> {
  const { appId, appSecret } = readEnv()

  const expires = Math.floor(Date.now() / 1000) + EXPIRES_WINDOW_S
  const data = JSON.stringify(dataObj) // ten sam string w `request` i w podpisie
  const sign = signature(route, data, expires, appId, appSecret)

  const body = new URLSearchParams({
    app_id: appId,
    request: data,
    expires: String(expires),
    signature: sign,
  })

  const res = await fetch(BASE_URL + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const text = await res.text()
  let parsed: ApaczkaResponse<T>
  try {
    parsed = JSON.parse(text) as ApaczkaResponse<T>
  } catch {
    throw new ApaczkaError(
      `Niepoprawna odpowiedź (nie-JSON, HTTP ${res.status}): ${text.slice(0, 300)}`,
      res.status,
      route,
      text,
    )
  }

  if (parsed.status !== 200) {
    throw new ApaczkaError(
      parsed.message || `Apaczka error status=${parsed.status}`,
      parsed.status,
      route,
      parsed,
    )
  }

  return parsed.response
}

// ─────────────────────────── Endpointy ───────────────────────────

/** Lista usług dostępnych na koncie (READ-ONLY — nic nie tworzy). */
export function getServiceStructure(): Promise<ServiceStructure> {
  return apaczkaRequest<ServiceStructure>('service_structure/', {})
}

/** Wycena przesyłki (nie tworzy zlecenia). */
export function orderValuation(order: Order): Promise<ValuationResult> {
  return apaczkaRequest<ValuationResult>('order_valuation/', { order })
}

/** Złożenie zlecenia nadania (TWORZY przesyłkę — używać ostrożnie). */
export function orderSend<T = unknown>(order: Order): Promise<T> {
  return apaczkaRequest<T>('order_send/', { order })
}

/** Pobranie listu przewozowego (waybill) dla zlecenia. */
export function getWaybill<T = unknown>(orderId: string | number): Promise<T> {
  return apaczkaRequest<T>(`waybill/${orderId}/`, {})
}

/** Szczegóły zlecenia. */
export function getOrder<T = unknown>(orderId: string | number): Promise<T> {
  return apaczkaRequest<T>(`order/${orderId}/`, {})
}

/** Anulowanie zlecenia. */
export function cancelOrder<T = unknown>(orderId: string | number): Promise<T> {
  return apaczkaRequest<T>(`order_cancel/${orderId}/`, {})
}
