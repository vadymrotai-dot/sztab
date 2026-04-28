// lib/openfoodfacts.ts
// Open Food Facts client — public, free, no auth.
//
// Endpoint: GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json
// Best practice: User-Agent з contact, rate limit 100/min (sliding window).
// Cache: відповідь cacheується в product_external.off_payload з off_fetched_at;
// повторний fetch тільки якщо > 7 days або force=true.

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product'
const USER_AGENT = 'Sztab/1.0 (vadymrotai@gmail.com)'
const RATE_LIMIT_PER_MIN = 100
const RATE_WINDOW_MS = 60_000
const REQUEST_TIMEOUT_MS = 15_000

// ─── Sliding window rate limiter (in-memory, per process) ───
const requestTimestamps: number[] = []

async function rateLimit(): Promise<void> {
  const now = Date.now()
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_WINDOW_MS) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= RATE_LIMIT_PER_MIN) {
    const wait = requestTimestamps[0] + RATE_WINDOW_MS - now
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait))
      return rateLimit()
    }
  }
  requestTimestamps.push(now)
}

// ─── Public types ───
export interface OFFProduct {
  found: boolean
  raw: Record<string, unknown> | null
  /** Best-guess brand (brands string є comma-separated; беремо first) */
  brand: string | null
  /** Comma-separated category path z OFF (np. "en:plant-based-foods, en:cabbage") */
  categories: string | null
  /** Free-form ingredients string */
  ingredients_text: string | null
  /** Allergens slug list (e.g. "en:milk,en:gluten") */
  allergens: string | null
  /** Packaging slug list */
  packaging: string | null
  /** Nutriments per 100g */
  nutriments: Record<string, unknown> | null
  /** Image URL (front of product) */
  image_url: string | null
  /** OFF product code as returned (often = ean) */
  code: string | null
  /** Quantity string z OFF, e.g. "500 g" або "1 L" */
  quantity: string | null
}

export class OFFNotFoundError extends Error {
  constructor(barcode: string) {
    super(`OFF: product not found for barcode ${barcode}`)
    this.name = 'OFFNotFoundError'
  }
}

// ─── Public API ───
export async function getOpenFoodFactsByBarcode(barcode: string): Promise<OFFProduct> {
  if (!barcode || !/^\d{8,14}$/.test(barcode)) {
    throw new Error(`Invalid barcode format: ${JSON.stringify(barcode)}`)
  }

  await rateLimit()

  const url = `${OFF_BASE}/${encodeURIComponent(barcode)}.json`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`OFF network error: ${msg}`)
  }

  if (!res.ok) {
    throw new Error(`OFF HTTP ${res.status} for barcode ${barcode}`)
  }

  const data = (await res.json()) as { status?: number; product?: Record<string, unknown> }
  if (data.status !== 1 || !data.product) {
    return {
      found: false,
      raw: null,
      brand: null,
      categories: null,
      ingredients_text: null,
      allergens: null,
      packaging: null,
      nutriments: null,
      image_url: null,
      code: null,
      quantity: null,
    }
  }

  const p = data.product
  const brandsStr = (p.brands as string | undefined) ?? null
  const brand = brandsStr ? brandsStr.split(',')[0]?.trim() ?? null : null

  return {
    found: true,
    raw: data as Record<string, unknown>,
    brand,
    categories: (p.categories as string | undefined) ?? null,
    ingredients_text: (p.ingredients_text as string | undefined) ?? null,
    allergens: (p.allergens as string | undefined) ?? null,
    packaging: (p.packaging as string | undefined) ?? null,
    nutriments: (p.nutriments as Record<string, unknown> | undefined) ?? null,
    image_url:
      (p.image_front_url as string | undefined) ?? (p.image_url as string | undefined) ?? null,
    code: (p.code as string | undefined) ?? barcode,
    quantity: (p.quantity as string | undefined) ?? null,
  }
}

/** Helper: normalize barcode (strip whitespace, leading zeros only if too short) */
export function normalizeBarcode(input: string): string {
  return input.replace(/\s+/g, '').replace(/[^0-9]/g, '')
}

/** Map OFF product → product_attributes-compatible key/value pairs.
 *  Returns only attributes що OFF provides з confidence (numeric quantity
 *  parse, brand string). Null values skipped — caller filters NULLs. */
export function offToAttributes(off: OFFProduct): Record<string, string | number | null> {
  if (!off.found) return {}

  const attrs: Record<string, string | number | null> = {}
  if (off.brand) attrs.brand = off.brand

  // Quantity → weight_g або volume_ml (best-effort parse)
  if (off.quantity) {
    const q = off.quantity.trim()
    const wMatch = q.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg)\b/i)
    const vMatch = q.match(/^(\d+(?:[.,]\d+)?)\s*(ml|l)\b/i)
    if (wMatch && wMatch[1] && wMatch[2]) {
      const num = parseFloat(wMatch[1].replace(',', '.'))
      attrs.weight_g = wMatch[2].toLowerCase() === 'kg' ? num * 1000 : num
    } else if (vMatch && vMatch[1] && vMatch[2]) {
      const num = parseFloat(vMatch[1].replace(',', '.'))
      attrs.volume_ml = vMatch[2].toLowerCase() === 'l' ? num * 1000 : num
    }
  }

  if (off.packaging) {
    const first = off.packaging.split(',')[0]?.replace(/^[a-z]{2}:/, '').trim()
    if (first) attrs.packaging_type = first
  }

  if (off.ingredients_text) attrs.ingredients = off.ingredients_text
  return attrs
}
