import * as XLSX from 'xlsx'

import { workbookToBlob } from '@/lib/importers/excel-parser'

// Builds the canonical XLSX template that Vadym hands to suppliers so
// they fill it in before re-importing. Matches the row 18 header / row
// 19 data start convention used by the Cennik B2B PL price list.
export function buildCennikTemplate(): Blob {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Cennik hurtowy
  const aoa: unknown[][] = []
  // Title block — 17 empty rows so the header lands on row 18 (1-indexed).
  // Row 1 carries a one-line title so the file opens with context, but
  // the importer ignores everything before the header row regardless.
  aoa.push(['Cennik hurtowy — szablon Sztab CRM'])
  aoa.push([
    'Wypełnij od wiersza 19. Wymagane: Nazwa produktu, Gramatura, Koszt EUR, EAN.',
  ])
  for (let i = 2; i < 17; i++) aoa.push([])

  aoa.push([
    'Lp.',
    'Nazwa produktu',
    'Gramatura',
    'Koszt EUR',
    'MAŁY OPT',
    'ŚREDNI OPT',
    'DUŻY OPT',
    'EAN',
    'Status',
  ])

  // Demo rows
  aoa.push([
    1,
    'Przykład — Kapusta kiszona',
    '3000 g',
    1.6,
    15.75,
    13.13,
    12.12,
    '4820000000017',
    '★',
  ])
  aoa.push([
    2,
    'Przykład — Surówka tradycyjna',
    '900 g',
    1.04,
    10.24,
    8.53,
    7.88,
    '4820000000024',
    '',
  ])
  aoa.push([
    3,
    'Przykład — Pomidory cherry',
    '500g / ~300g',
    0.78,
    7.68,
    6.4,
    5.91,
    '4820000000031',
    'Sezon',
  ])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // Column widths so the file is legible when opened.
  ws['!cols'] = [
    { wch: 5 },
    { wch: 36 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Cennik hurtowy')

  // Sheet 2: Instrukcja
  const instructions: unknown[][] = [
    ['Instrukcja wypełniania szablonu cennika'],
    [''],
    [
      '1. Nagłówki kolumn znajdują się w wierszu 18. Dane wpisujemy od wiersza 19 w dół.',
    ],
    ['2. Wymagane pola dla każdej pozycji: Nazwa produktu, Gramatura, Koszt EUR, EAN.'],
    [''],
    ['Format pól:'],
    [
      '  • Lp. — opcjonalne, numeracja porządkowa.',
    ],
    [
      '  • Nazwa produktu — pełna nazwa handlowa, min. 3 znaki.',
    ],
    [
      '  • Gramatura — format "3000 g", "1 kg", "5000g / ~3000g" (dla wagi netto/brutto).',
    ],
    [
      '  • Koszt EUR — cena jednostkowa zakupu od dostawcy, kropka jako separator dziesiętny.',
    ],
    [
      '  • MAŁY OPT / ŚREDNI OPT / DUŻY OPT — sugerowane ceny sprzedaży w trzech segmentach (PLN).',
    ],
    [
      '  • EAN — kod kreskowy: 8, 12 lub 13 cyfr, bez spacji i kresek.',
    ],
    [
      '  • Status — opcjonalnie. Wpisz "★" lub "bestseller" jeśli pozycja ma być oznaczona jako hero.',
    ],
    [''],
    [
      'Sekcje kategorii (opcjonalnie):',
    ],
    [
      '  • Można rozdzielać produkty wierszami nagłówkowymi w formacie "▼ NAZWA KATEGORII".',
    ],
    [
      '  • Importer rozpozna je i przypisze nazwę kategorii do wszystkich kolejnych pozycji.',
    ],
    [''],
    [
      'Po zapisaniu pliku wyślij go do Vadyma lub samodzielnie zaimportuj na stronie /products → "Importuj cennik z Excel".',
    ],
  ]
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions)
  wsInstr['!cols'] = [{ wch: 110 }]
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrukcja')

  return workbookToBlob(wb)
}

export const CENNIK_TEMPLATE_FILENAME = 'Sztab_cennik_szablon.xlsx'
