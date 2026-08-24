/**
 * Генерація динамічної оферти під клієнта (xlsx) — з поточними цінами саме
 * цього клієнта (його знижки + роздрібна позначка). PL/UA.
 *
 * Ціна = computeNewUnitPrice(product, znizka, markupForSupplier) — та сама
 * логіка, що й у замовярці, тож оферта == ціни у формі.
 *
 * Стилі: xlsx-js-style (drop-in SheetJS + cell `.s`) — банер DAGOLD,
 * кольорові бенди по постачальниках, шапка з клієнтом, ціни жирним.
 */

import 'server-only'

import * as XLSX from 'xlsx-js-style'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeNewUnitPrice,
  resolveClientDiscount,
  markupForSupplier,
} from '@/lib/orders/pricing'
import { GLOBAL_FOOD_SUPPLIER_ID } from '@/lib/orders/discount-tiers'

const L = {
  pl: {
    sheet: 'Oferta',
    subtitle: 'Oferta hurtowa — kiszonki • ryby i owoce morza • wędliny • przekąski',
    client: 'Klient',
    date: 'Data',
    net: 'Ceny netto (PLN)',
    product: 'Produkt',
    gram: 'Gramatura',
    unit: 'j.m.',
    price: 'Cena netto',
    foot: 'Ceny obowiązują dla wskazanego klienta (uwzględniają indywidualne rabaty). Zamówienie online — link w wiadomości e-mail.',
  },
  ua: {
    sheet: 'Оферта',
    subtitle: 'Гуртова оферта — квашені • риба й морепродукти • вендліни • снеки',
    client: 'Клієнт',
    date: 'Дата',
    net: 'Ціни нетто (PLN)',
    product: 'Товар',
    gram: 'Фасування',
    unit: 'од.',
    price: 'Ціна нетто',
    foot: 'Ціни дійсні для вказаного клієнта (з урахуванням індивідуальних знижок). Замовлення онлайн — посилання в листі.',
  },
} as const

// Бренд + палітра груп (циклічно по постачальниках у порядку появи).
const NAVY = '1F3A5F'
const WHITE = 'FFFFFF'
const INK = '2B2B2B'
const MUTE = '8A8A8A'
const PALETTE: { band: string; tint: string }[] = [
  { band: '2E7D32', tint: 'E8F2E8' }, // зелений
  { band: '1565C0', tint: 'E4EEF8' }, // синій
  { band: 'A83232', tint: 'F5E6E4' }, // червоний
  { band: 'B8860B', tint: 'F7EFD9' }, // бурштин
  { band: '5E35B1', tint: 'ECE5F6' }, // фіолет
  { band: '00838F', tint: 'DEF0F1' }, // бірюза
]

function bd(rgb: string) {
  const s = { style: 'thin' as const, color: { rgb } }
  return { top: s, bottom: s, left: s, right: s }
}

const St = {
  brand: {
    font: { bold: true, sz: 24, color: { rgb: WHITE } },
    fill: { fgColor: { rgb: NAVY } },
    alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
  },
  brandSub: {
    font: { sz: 11, color: { rgb: 'C9D6E5' } },
    fill: { fgColor: { rgb: NAVY } },
    alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
  },
  meta: {
    font: { sz: 10, color: { rgb: MUTE } },
    alignment: { horizontal: 'left', indent: 1 },
  },
  white: { fill: { fgColor: { rgb: WHITE } } },
  band: (c: string) => ({
    font: { bold: true, sz: 12, color: { rgb: WHITE } },
    fill: { fgColor: { rgb: c } },
    alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
  }),
  head: (c: string) => ({
    font: { bold: true, sz: 10, color: { rgb: WHITE } },
    fill: { fgColor: { rgb: c } },
    alignment: { horizontal: 'left', indent: 1 },
    border: bd(WHITE),
  }),
  headR: (c: string) => ({
    font: { bold: true, sz: 10, color: { rgb: WHITE } },
    fill: { fgColor: { rgb: c } },
    alignment: { horizontal: 'right', indent: 1 },
    border: bd(WHITE),
  }),
  cell: (f: string) => ({
    font: { sz: 10, color: { rgb: INK } },
    fill: { fgColor: { rgb: f } },
    alignment: { horizontal: 'left', indent: 1, vertical: 'center' },
    border: bd('E3E3E3'),
  }),
  cellC: (f: string) => ({
    font: { sz: 10, color: { rgb: MUTE } },
    fill: { fgColor: { rgb: f } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: bd('E3E3E3'),
  }),
  price: (f: string) => ({
    font: { sz: 10, bold: true, color: { rgb: INK } },
    fill: { fgColor: { rgb: f } },
    alignment: { horizontal: 'right', indent: 1, vertical: 'center' },
    numFmt: '#,##0.00 "zł"',
    border: bd('E3E3E3'),
  }),
  foot: {
    font: { italic: true, sz: 9, color: { rgb: MUTE } },
    alignment: { horizontal: 'left', indent: 1 },
  },
}

export async function buildClientOfferXlsx(
  clientId: string,
  lang: 'pl' | 'ua',
): Promise<{ buffer: Buffer; filename: string }> {
  const admin = createAdminClient()
  const discounts = await resolveClientDiscount(admin, clientId)
  const t = L[lang]

  const { data: cli } = await admin
    .from('clients')
    .select('title')
    .eq('id', clientId)
    .maybeSingle()
  const clientTitle = (cli?.title as string) || '—'

  const { data: suppliers } = await admin.from('suppliers').select('id, name')
  const supName = new Map((suppliers ?? []).map((s: any) => [s.id, s.name]))

  const { data: products } = await admin
    .from('products')
    .select(
      'id, name, display_name, gramatura, unit, supplier_id, marza_bazowa_pct, cost_pln, order_form_sort',
    )
    .eq('show_in_orders', true)
    .order('supplier_id', { ascending: true })
    .order('order_form_sort', { ascending: true })

  // Порахувати ціни й згрупувати по постачальнику (у порядку появи).
  const groups: { supId: string; name: string; rows: any[][] }[] = []
  const idx = new Map<string, number>()
  for (const p of (products ?? []) as any[]) {
    const ind =
      p.supplier_id === GLOBAL_FOOD_SUPPLIER_ID ? discounts.kalmar : discounts.ogolna
    const price = computeNewUnitPrice(
      { marza_bazowa_pct: p.marza_bazowa_pct, cost_pln: p.cost_pln },
      ind,
      markupForSupplier(p.supplier_id, discounts.restaurantMarkup),
    )
    if (price == null || Number.isNaN(price)) continue
    let g = idx.get(p.supplier_id)
    if (g == null) {
      g = groups.length
      idx.set(p.supplier_id, g)
      groups.push({
        supId: p.supplier_id,
        name: supName.get(p.supplier_id) ?? '—',
        rows: [],
      })
    }
    const gram = (p.gramatura && String(p.gramatura).trim()) || (lang === 'ua' ? 'на вагу' : 'na wagę')
    groups[g].rows.push([
      p.display_name || p.name,
      gram,
      p.unit || 'szt',
      price,
    ])
  }

  // ── Будуємо аркуш вручну (стилі per-cell) ──
  const ws: any = {}
  const merges: any[] = []
  const NC = 4 // A..D
  let r = 0
  const put = (row: number, col: number, v: string | number, s: any) => {
    ws[XLSX.utils.encode_cell({ r: row, c: col })] = {
      v,
      t: typeof v === 'number' ? 'n' : 's',
      s,
    }
  }
  const fillRow = (row: number, s: any) => {
    for (let c = 0; c < NC; c++) put(row, c, '', s)
  }
  const mergeWide = (row: number) => merges.push({ s: { r: row, c: 0 }, e: { r: row, c: NC - 1 } })

  // Банер
  fillRow(r, St.brand)
  put(r, 0, 'DAGOLD', St.brand)
  mergeWide(r)
  r++
  fillRow(r, St.brandSub)
  put(r, 0, t.subtitle, St.brandSub)
  mergeWide(r)
  r++
  fillRow(r, St.white)
  r++
  const today = new Date().toISOString().slice(0, 10)
  put(r, 0, `${t.client}: ${clientTitle}   |   ${t.date}: ${today}   |   ${t.net}`, St.meta)
  mergeWide(r)
  r++
  put(r, 0, 'DAGOLD Sp. z o.o.  •  tel. +48 510 924 301  •  vasin@dagold.com', St.meta)
  mergeWide(r)
  r++
  fillRow(r, St.white)
  r++

  // Групи
  groups.forEach((g, gi) => {
    const col = PALETTE[gi % PALETTE.length]
    fillRow(r, St.band(col.band))
    put(r, 0, `▍ ${g.name}`, St.band(col.band))
    mergeWide(r)
    r++
    put(r, 0, t.product, St.head(col.band))
    put(r, 1, t.gram, St.head(col.band))
    put(r, 2, t.unit, St.head(col.band))
    put(r, 3, t.price, St.headR(col.band))
    r++
    g.rows.forEach((row, i) => {
      const f = i % 2 ? col.tint : WHITE
      put(r, 0, row[0], St.cell(f))
      put(r, 1, row[1], St.cellC(f))
      put(r, 2, row[2], St.cellC(f))
      put(r, 3, row[3], St.price(f))
      r++
    })
    fillRow(r, St.white)
    r++
  })

  put(r, 0, t.foot, St.foot)
  mergeWide(r)
  r++

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: NC - 1 } })
  ws['!merges'] = merges
  ws['!cols'] = [{ wch: 42 }, { wch: 13 }, { wch: 7 }, { wch: 16 }]
  ws['!rows'] = [{ hpt: 34 }, { hpt: 20 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, t.sheet)

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return { buffer, filename: `DAGOLD_oferta_${lang.toUpperCase()}.xlsx` }
}
