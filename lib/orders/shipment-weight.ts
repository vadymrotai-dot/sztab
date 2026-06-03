/**
 * Parser wagi przesyłki z products.gramatura (3C).
 *
 * gramatura to TEXT w różnych formatach (rozmiar/zawartość opakowania, NIE waga
 * wysyłkowa) — używamy jej jako PODPOWIEDZI wagi brutto dla Apaczka. Operator
 * może nadpisać ręcznie (order_shipments.weight).
 *
 * Realne formaty w bazie (DISTINCT, 03.06.2026):
 *   "1 kg", "3000 g", "300 g", "900 g", "400 g", "500 g", "1500 g", "350 g",
 *   "1000g / ~600g", "5000g / ~3000g", "500g / ~300g", "3000g / ~2000g",
 *   "350g / ~250g"
 *
 * Zasady:
 *   - gramy → /1000, kg → ×1
 *   - przecinek = separator dziesiętny ("1,5 kg" → 1.5)
 *   - kilka liczb (np. "5000g / ~3000g") → bierz MAX (waga brutto z zalewą)
 *   - każda liczba konwertowana osobno do kg PRZED max (jednostki mogą się różnić)
 *   - brak jednostki przy liczbie → heurystyka: >=100 gramy, <100 kg
 *   - nie da się sparsować → fallback 0
 */

export type WeightItem = {
  gramatura: string | null
  qty: number | string
  delivery_point_id?: string | null
}

/**
 * Parsuje pojedynczy string gramatury do kg (float).
 * Gdy kilka liczb — zwraca MAX (po konwersji każdej do kg). Fallback 0.
 */
export function parseGramaturaToKg(gramatura: string | null | undefined): number {
  if (!gramatura || typeof gramatura !== 'string') return 0

  const s = gramatura.toLowerCase()
  // Złap wszystkie pary (liczba [, opcjonalna jednostka]).
  // Przecinek/kropka jako separator dziesiętny. 'kg' przed 'g' (alternacja).
  const re = /(\d+(?:[.,]\d+)?)\s*(kg|g)?/g
  const kgValues: number[] = []

  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    const numRaw = m[1]
    if (numRaw === undefined || numRaw === '') continue
    const num = parseFloat(numRaw.replace(',', '.'))
    if (!Number.isFinite(num)) continue

    let unit = m[2] // 'kg' | 'g' | undefined
    if (!unit) {
      // Brak jednostki — heurystyka po wielkości (realne dane zawsze mają jednostkę,
      // to tylko zabezpieczenie). >=100 → gramy, <100 → kg.
      unit = num >= 100 ? 'g' : 'kg'
    }
    const kg = unit === 'kg' ? num : num / 1000
    kgValues.push(kg)
  }

  if (kgValues.length === 0) return 0
  return Math.max(...kgValues)
}

/** Zaokrąglenie do 1 miejsca (parytet z order_shipments.weight numeric(6,1)). */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function qtyNum(q: number | string): number {
  const n = typeof q === 'number' ? q : parseFloat(String(q))
  return Number.isFinite(n) ? n : 0
}

/**
 * Waga całego zamówienia w kg = Σ (waga_jednostki_kg × qty).
 * Zaokrąglone do 1 miejsca.
 */
export function orderWeightKg(items: WeightItem[]): number {
  const total = items.reduce(
    (sum, it) => sum + parseGramaturaToKg(it.gramatura) * qtyNum(it.qty),
    0,
  )
  return round1(total)
}

/**
 * Waga pozycji przypisanych do punktu (filter delivery_point_id) w kg.
 * Zaokrąglone do 1 miejsca.
 */
export function pointWeightKg(
  items: WeightItem[],
  deliveryPointId: string,
): number {
  const total = items
    .filter((it) => it.delivery_point_id === deliveryPointId)
    .reduce(
      (sum, it) => sum + parseGramaturaToKg(it.gramatura) * qtyNum(it.qty),
      0,
    )
  return round1(total)
}
