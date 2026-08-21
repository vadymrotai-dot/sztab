/**
 * Parser faktury zakupowej (Ф3.1) — vision/dokument Claude.
 *
 * Wejście: plik faktury (zdjęcie JPG/PNG albo PDF) w base64.
 * Wyjście: ustrukturyzowane pozycje (nazwa, EAN, jednostka, ilość, cena).
 * Linie usługowe (transport itd.) oznaczane is_service=true — commit je pomija.
 *
 * Ceny/ilości zwracane w walucie źródłowej (np. EUR dla AVIS-D); konwersję na
 * PLN robi commit wg ręcznego kursu operatora. Nazwy mogą być w obcym języku
 * (angielski/łotewski) — matching do katalogu Sztab przez aliasy + AI osobno.
 */

import 'server-only'

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS, extractJSON } from '@/lib/ai-providers'

export type ParsedInvoiceLine = {
  name: string
  ean: string | null
  unit: string | null
  qty: number
  unit_price: number | null // cena za jednostkę w walucie źródłowej
  is_service: boolean
}

export type ParsedInvoice = {
  supplier_name: string | null
  invoice_number: string | null
  invoice_date: string | null // YYYY-MM-DD
  currency: string | null
  lines: ParsedInvoiceLine[]
}

const PROMPT = `Jesteś parserem faktur zakupowych. Otrzymujesz obraz albo PDF faktury.
Wyodrębnij dane i zwróć WYŁĄCZNIE poprawny JSON (bez komentarzy, bez markdown):

{
  "supplier_name": string|null,
  "invoice_number": string|null,
  "invoice_date": "YYYY-MM-DD"|null,
  "currency": "EUR"|"PLN"|...|null,
  "lines": [
    {
      "name": string,          // dokładna nazwa towaru z faktury (zachowaj język oryginału)
      "ean": string|null,      // kod EAN jeśli jest
      "unit": string|null,     // jednostka miary (kg, szt...)
      "qty": number,           // ILOŚĆ PRZYJĘTA — waga netto / liczba jednostek (kolumna Net weight / Order units)
      "unit_price": number|null, // cena za jednostkę (kolumna Price)
      "is_service": boolean    // true dla usług/transportu/opłat (nie towar magazynowy)
    }
  ]
}

Zasady:
- Liczby z kropką dziesiętną (np. 11.5, nie 11,5).
- qty to faktyczna przyjęta ilość na magazyn (dla ryb zwykle waga netto w kg).
- Pozycje typu "Transport", "usługa", "opłata" → is_service=true.
- Nie wymyślaj EAN — jeśli pusty, null.
- Zwróć wszystkie wiersze towarowe.`

export async function parsePurchaseInvoice(opts: {
  apiKey: string
  fileBase64: string
  mimeType: string // image/jpeg | image/png | image/webp | application/pdf
}): Promise<ParsedInvoice> {
  if (!opts.apiKey) throw new Error('Brak klucza Claude API (params.anthropic_api_key)')

  const client = new Anthropic({ apiKey: opts.apiKey })
  const isPdf = opts.mimeType === 'application/pdf'

  // typ media-блоку різниться між версіями SDK (document/image) — тримаємо any,
  // рантайм-форма відповідає Anthropic API.
  const mediaBlock: any = isPdf
    ? {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: opts.fileBase64 },
      }
    : {
        type: 'image',
        source: { type: 'base64', media_type: opts.mimeType, data: opts.fileBase64 },
      }

  const resp = await client.messages.create(
    {
      model: AI_MODELS.BALANCED, // Sonnet — dokładność OCR/vision
      max_tokens: 4096,
      messages: [
        { role: 'user', content: [mediaBlock, { type: 'text', text: PROMPT }] as any },
      ],
    },
    { timeout: 60_000 },
  )

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const parsed = extractJSON<ParsedInvoice>(text)

  const num = (v: unknown): number | null => {
    if (v == null) return null
    const n = Number(String(v).replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }

  return {
    supplier_name: parsed.supplier_name ?? null,
    invoice_number: parsed.invoice_number ?? null,
    invoice_date: parsed.invoice_date ?? null,
    currency: parsed.currency ?? null,
    lines: (parsed.lines ?? []).map((l) => ({
      name: String(l.name ?? '').trim(),
      ean: l.ean ? String(l.ean).trim() : null,
      unit: l.unit ? String(l.unit).trim() : null,
      qty: num(l.qty) ?? 0,
      unit_price: num(l.unit_price),
      is_service: Boolean(l.is_service),
    })).filter((l) => l.name.length > 0),
  }
}
