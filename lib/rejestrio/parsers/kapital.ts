// lib/rejestrio/parsers/kapital.ts
// Sprint S2A Phase 1A — sum of dane_wspolnikow[].udzialy__wartosc.
//
// rozdzial-ogolny.kapital_zakladowy field is often null дla sp.z o.o.
// у v2. Real value lives у dane_wspolnikow._obiekty.{N}.
// posiadane_przez_wspolnika_udzialy__wartosc._wartosc.kwota.
//
// KOZAK example: 67 udziałów × 50zł + 33 udziały × 50zł = 3350 + 1650 = 5000zł.

interface UdzialyEntry {
  posiadane_przez_wspolnika_udzialy__wartosc?: {
    _wartosc?: { kwota?: string; waluta?: string }
  }
}

interface DaneWspolnikowField {
  _obiekty?: Record<string, UdzialyEntry>
}

export function sumKapitalZWspolnikow(
  dane_wspolnikow: DaneWspolnikowField | undefined,
): number | null {
  if (!dane_wspolnikow?._obiekty) return null
  let total = 0
  let foundAny = false
  for (const entry of Object.values(dane_wspolnikow._obiekty)) {
    const kwota = entry?.posiadane_przez_wspolnika_udzialy__wartosc?._wartosc?.kwota
    if (!kwota) continue
    const n = parseFloat(String(kwota).replace(/\s/g, '').replace(',', '.'))
    if (Number.isFinite(n)) {
      total += n
      foundAny = true
    }
  }
  return foundAny ? Math.round(total * 100) / 100 : null
}
