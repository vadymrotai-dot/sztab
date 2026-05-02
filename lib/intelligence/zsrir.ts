// lib/intelligence/zsrir.ts
// Sprint S-INTEL.1.2.1 — ZSRIR (Zintegrowany System Rolniczej Informacji
// Rynkowej) data fetcher. Free open data Ministerstwa Rolnictwa via
// dane.gov.pl API + xlsx bulletins.
//
// 13 ZSRIR datasets confirmed live 02.05.2026 (Vadym):
//   367  cukier              low
//   546  zboża               medium
//   601  drób                medium
//   619  chmiel              low
//   777  wieprzowina         medium
//   912  owoce i warzywa     HIGH ⭐
//   957  rośliny oleiste     low
//   983  baranina            low
//   1003 jaja spożywcze      medium
//   1022 pasze               low
//   1024 mleko               HIGH ⭐
//   1188 tytoń               skip
//   1214 wołowina i cielęcina medium
//
// Phase 1 (this sprint): HIGH only (912 + 1024). Решта — TODO comments
// у DATASETS registry. Експансія по mere accumulating real labels.
//
// API:
//   GET https://api.dane.gov.pl/1.4/datasets/{id}/resources?per_page=3&sort=-created
//   → data[].attributes.{title, created, file_url, format}
//   file_url = direct xlsx download
//
// Filename pattern UNSTABLE (changed 2025 → 2026). Завжди
// extract title + file_url з resources metadata. Не parse filename.
//
// Output: writes commodity_prices з source='zsrir', cn_code resolved
// через commodity_to_cn_map (NULL якщо немає mapping — "intake first,
// map later").

import type { SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

// ───────── Types ─────────

export interface ZsrirDataset {
  id: number
  label_pl: string
  priority: 'high' | 'medium' | 'low' | 'skip'
  /**
   * Parser variant — how to extract rows з sheet. Each variant codes
   * рассматривает specific sheet structure (header row position,
   * label column index, price column index, unit, etc.). Якщо new
   * dataset has structure не у parsers — log + skip.
   */
  parser: 'owoce_warzywa' | 'mleko' | 'TODO'
  /**
   * Default unit — applied якщо xlsx doesn't specify. (Більшість
   * ZSRIR bulletins use kg or 100kg для warzywa-owoce, kg для mleko.)
   */
  default_unit: 'kg' | 'ton' | '100kg' | 'liter' | 'piece'
}

export interface ZsrirIngestResult {
  rows_inserted: number
  rows_skipped: number  // duplicates (ON CONFLICT DO NOTHING)
  rows_failed: number
  datasets_processed: number
  datasets_skipped: number
  errors: string[]
}

interface ResourceMetadata {
  id: string
  type: string
  attributes: {
    title: string
    created?: string
    file_url?: string
    format?: string
    data_date?: string
  }
}

interface DatasetResourcesResponse {
  data: ResourceMetadata[]
  meta?: { count?: number }
}

interface ParsedRow {
  product_label: string
  price_pln: number | null
  observation_date: string  // ISO date YYYY-MM-DD
  unit: string
  raw_cells: Record<string, unknown>
  sheet_name: string
  row_index: number
}

// ───────── Dataset registry (Phase 1 — HIGH priority only) ─────────

export const ZSRIR_DATASETS: ZsrirDataset[] = [
  // HIGH priority — implemented цей sprint
  {
    id: 912,
    label_pl: 'owoce i warzywa świeże',
    priority: 'high',
    parser: 'owoce_warzywa',
    default_unit: 'kg',
  },
  {
    id: 1024,
    label_pl: 'mleko',
    priority: 'high',
    parser: 'mleko',
    default_unit: 'liter',
  },

  // MEDIUM priority — TODO у follow-up sprint (S-INTEL.1.2 cleanup
  // або S-INTEL.2). Parser='TODO' блокує auto-ingest. Add new parser
  // variant у parseSheet() switch для активації.
  // {  id: 546,  label_pl: 'zboża',                  priority: 'medium', parser: 'TODO', default_unit: 'ton' },
  // {  id: 601,  label_pl: 'drób',                   priority: 'medium', parser: 'TODO', default_unit: 'kg'  },
  // {  id: 777,  label_pl: 'wieprzowina',            priority: 'medium', parser: 'TODO', default_unit: 'kg'  },
  // {  id: 1003, label_pl: 'jaja spożywcze',         priority: 'medium', parser: 'TODO', default_unit: 'piece' },
  // {  id: 1214, label_pl: 'wołowina i cielęcina',   priority: 'medium', parser: 'TODO', default_unit: 'kg'  },

  // LOW priority — no plans currently
  // 367 cukier, 619 chmiel, 957 rośliny oleiste, 983 baranina, 1022 pasze
  // SKIP: 1188 tytoń (Sztab не handle тютюн)
]

const DANE_GOV_API_BASE = 'https://api.dane.gov.pl/1.4'
const FETCH_TIMEOUT_MS = 30_000

// ───────── HTTP helpers ─────────

async function fetchLatestResource(datasetId: number): Promise<ResourceMetadata | null> {
  const url = `${DANE_GOV_API_BASE}/datasets/${datasetId}/resources?per_page=3&sort=-created`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`dane.gov.pl ${res.status} ${res.statusText}`)
    }
    const json = (await res.json()) as DatasetResourcesResponse
    const list = Array.isArray(json.data) ? json.data : []
    // Filter only xlsx — sometimes datasets contain CSV mirrors
    const xlsx = list.find(
      (r) =>
        r.attributes?.format?.toLowerCase() === 'xlsx' ||
        r.attributes?.file_url?.toLowerCase().endsWith('.xlsx'),
    )
    return xlsx ?? list[0] ?? null
  } catch (err) {
    throw new Error(
      `fetchLatestResource(${datasetId}): ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

async function downloadXlsx(fileUrl: string): Promise<XLSX.WorkBook> {
  const res = await fetch(fileUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`xlsx download ${res.status}: ${fileUrl}`)
  }
  const buf = await res.arrayBuffer()
  return XLSX.read(buf, { type: 'array', cellDates: true })
}

// ───────── Parser variants ─────────

/**
 * Parser для dataset 912 "owoce i warzywa świeże".
 * Bulletins typically have main sheet з:
 *   - Header rows (1-3): metadata
 *   - Then table з columns "Towar | Jednostka | Cena minimalna | Cena maksymalna | Cena średnia"
 *
 * Defensive: looks for cells matching label patterns. Якщо sheet structure
 * відрізняється — повертає 0 rows + log warning. Не throw.
 */
function parseOwoceWarzywa(
  workbook: XLSX.WorkBook,
  observationDate: string,
  defaultUnit: string,
): ParsedRow[] {
  const rows: ParsedRow[] = []
  const labelHints = ['towar', 'produkt', 'nazwa', 'asortyment']
  const priceHints = ['cena średnia', 'średnia', 'cena śr', 'cena netto']

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    })
    if (!Array.isArray(data) || data.length < 2) continue

    // Find header row
    let headerRowIdx = -1
    for (let i = 0; i < Math.min(data.length, 12); i++) {
      const row = data[i] as unknown[]
      const joined = row
        .map((c) => (c == null ? '' : String(c).toLowerCase()))
        .join('|')
      if (labelHints.some((h) => joined.includes(h))) {
        headerRowIdx = i
        break
      }
    }
    if (headerRowIdx === -1) continue

    const header = (data[headerRowIdx] as unknown[]).map((c) =>
      c == null ? '' : String(c).toLowerCase().trim(),
    )
    const labelColIdx = header.findIndex((h) =>
      labelHints.some((hint) => h.includes(hint)),
    )
    const priceColIdx = header.findIndex((h) =>
      priceHints.some((hint) => h.includes(hint)),
    )
    const unitColIdx = header.findIndex((h) => h.includes('jednost'))

    if (labelColIdx === -1 || priceColIdx === -1) continue

    for (let i = headerRowIdx + 1; i < data.length; i++) {
      const row = data[i] as unknown[]
      const rawLabel = row[labelColIdx]
      const rawPrice = row[priceColIdx]
      const rawUnit = unitColIdx >= 0 ? row[unitColIdx] : null

      if (rawLabel == null || String(rawLabel).trim() === '') continue
      const label = String(rawLabel).trim()
      // Skip aggregate / section header rows
      if (label.length > 80 || /razem|ogółem|suma/i.test(label)) continue

      const price = parsePolishNumber(rawPrice)
      if (price === null) continue

      const unit = rawUnit ? normalizeUnit(String(rawUnit)) : defaultUnit

      rows.push({
        product_label: label,
        price_pln: price,
        observation_date: observationDate,
        unit,
        raw_cells: { label: rawLabel, price: rawPrice, unit: rawUnit },
        sheet_name: sheetName,
        row_index: i,
      })
    }
  }

  return rows
}

/**
 * Parser для dataset 1024 "mleko".
 * Bulletins typically мають sheet з:
 *   "Klasa mleka | Województwo | Cena PLN/100l"
 * або aggregate "Cena mleka surowego — średnia krajowa".
 *
 * Phase 1: capture тільки aggregate national average (uniwersalна).
 * Per-województwo breakdown — TODO якщо потрібно для regional matching.
 */
function parseMleko(
  workbook: XLSX.WorkBook,
  observationDate: string,
  defaultUnit: string,
): ParsedRow[] {
  const rows: ParsedRow[] = []
  const milkHints = ['mleko surowe', 'cena mleka', 'krajowa', 'ogółem', 'ogolem']

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    })
    if (!Array.isArray(data) || data.length < 2) continue

    for (let i = 0; i < data.length; i++) {
      const row = data[i] as unknown[]
      const cellStrs = row.map((c) =>
        c == null ? '' : String(c).toLowerCase().trim(),
      )
      const joined = cellStrs.join('|')

      // Look for milk-aggregate row patterns
      if (!milkHints.some((h) => joined.includes(h))) continue

      // Extract label: longest non-empty text cell
      const labelCell = row.find(
        (c) => typeof c === 'string' && c.trim().length > 5,
      )
      if (!labelCell) continue

      // Extract price: first numeric cell з реалістичним range (50..500 PLN/100l)
      let price: number | null = null
      for (const c of row) {
        const num = parsePolishNumber(c)
        if (num != null && num > 50 && num < 500) {
          price = num
          break
        }
      }
      if (price === null) continue

      rows.push({
        product_label: String(labelCell).trim(),
        price_pln: price,
        observation_date: observationDate,
        unit: defaultUnit === 'liter' ? '100liter' : defaultUnit,
        raw_cells: { row: row.slice(0, 8) },
        sheet_name: sheetName,
        row_index: i,
      })

      // Один aggregate row per sheet — break до next sheet
      break
    }
  }

  return rows
}

// ───────── Helpers ─────────

function parsePolishNumber(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const s = String(raw).trim()
  if (!s) return null
  // Handle PL convention: "1 234,56" or "1234,56" or "1.234,56"
  const cleaned = s
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // remove thousands dot
    .replace(',', '.')
  const num = parseFloat(cleaned)
  return Number.isFinite(num) ? num : null
}

function normalizeUnit(raw: string): string {
  const s = raw.toLowerCase().trim()
  if (s.includes('100') && (s.includes('kg') || s.includes('kilo'))) return '100kg'
  if (s.includes('100') && (s.includes('l') || s.includes('liter'))) return '100liter'
  if (s.includes('ton') || s === 't') return 'ton'
  if (s.includes('kg') || s.includes('kilo')) return 'kg'
  if (s.includes('liter') || s.includes('litr') || s === 'l') return 'liter'
  if (s.includes('szt') || s.includes('piec')) return 'piece'
  return s.slice(0, 20) || 'unknown'
}

function extractObservationDate(resource: ResourceMetadata): string {
  // Prefer resource.attributes.data_date якщо present (ZSRIR sometimes
  // populates this), else fall back to created date.
  const date = resource.attributes?.data_date ?? resource.attributes?.created
  if (!date) {
    return new Date().toISOString().slice(0, 10)
  }
  // Strip time component
  return date.slice(0, 10)
}

function parseSheet(
  parser: ZsrirDataset['parser'],
  workbook: XLSX.WorkBook,
  observationDate: string,
  defaultUnit: string,
): ParsedRow[] {
  switch (parser) {
    case 'owoce_warzywa':
      return parseOwoceWarzywa(workbook, observationDate, defaultUnit)
    case 'mleko':
      return parseMleko(workbook, observationDate, defaultUnit)
    case 'TODO':
      return [] // Skip silently — TODO у follow-up sprint
    default:
      return []
  }
}

// ───────── Main ingest ─────────

export interface IngestOptions {
  /** Override registry (для testing або partial runs). */
  datasets?: ZsrirDataset[]
  /** Verbose console.log per dataset / per row. */
  verbose?: boolean
}

export async function ingestZsrir(
  supabase: SupabaseClient,
  options: IngestOptions = {},
): Promise<ZsrirIngestResult> {
  const datasets = options.datasets ?? ZSRIR_DATASETS
  const result: ZsrirIngestResult = {
    rows_inserted: 0,
    rows_skipped: 0,
    rows_failed: 0,
    datasets_processed: 0,
    datasets_skipped: 0,
    errors: [],
  }

  for (const ds of datasets) {
    if (ds.priority === 'skip' || ds.parser === 'TODO') {
      result.datasets_skipped++
      continue
    }

    if (options.verbose) {
      console.log(`[ZSRIR] Processing ${ds.id} (${ds.label_pl})...`)
    }

    try {
      const resource = await fetchLatestResource(ds.id)
      if (!resource || !resource.attributes?.file_url) {
        const msg = `dataset ${ds.id} (${ds.label_pl}): no resource / file_url`
        result.errors.push(msg)
        result.datasets_skipped++
        continue
      }

      const observationDate = extractObservationDate(resource)
      const workbook = await downloadXlsx(resource.attributes.file_url)
      const rows = parseSheet(ds.parser, workbook, observationDate, ds.default_unit)

      if (options.verbose) {
        console.log(
          `[ZSRIR]   parsed ${rows.length} rows від "${resource.attributes.title}" (${observationDate})`,
        )
      }

      if (rows.length === 0) {
        result.datasets_processed++
        continue
      }

      // Resolve cn_code via commodity_to_cn_map
      const labels = rows.map((r) => r.product_label)
      const { data: mappings } = await supabase
        .from('commodity_to_cn_map')
        .select('source_label, cn_code')
        .eq('source', 'zsrir')
        .in('source_label', labels)
      const mapByLabel = new Map<string, string>(
        ((mappings ?? []) as Array<{ source_label: string; cn_code: string }>).map(
          (m) => [m.source_label, m.cn_code],
        ),
      )

      // Bulk insert chunks of 100
      const CHUNK_SIZE = 100
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE).map((row) => ({
          cn_code: mapByLabel.get(row.product_label) ?? null,
          source: 'zsrir' as const,
          market: null,
          product_label: row.product_label,
          price_pln: row.price_pln,
          price_eur: null,
          currency_native: 'PLN' as const,
          unit: row.unit,
          observation_date: row.observation_date,
          category: 'food' as const,
          raw_payload: {
            dataset_id: ds.id,
            dataset_label: ds.label_pl,
            resource_title: resource.attributes.title,
            sheet_name: row.sheet_name,
            row_index: row.row_index,
            raw_cells: row.raw_cells,
          },
        }))

        // Idempotent — UNIQUE INDEX commodity_prices_uniq_observation
        // catches duplicates. PostgREST upsert з onConflict skip.
        const { error: insertErr, count } = await supabase
          .from('commodity_prices')
          .upsert(chunk, {
            onConflict: 'source,market,product_label,observation_date',
            ignoreDuplicates: true,
            count: 'exact',
          })

        if (insertErr) {
          const msg = `dataset ${ds.id} chunk ${i}: ${insertErr.message}`
          result.errors.push(msg)
          result.rows_failed += chunk.length
          continue
        }

        // count тут — рows actually inserted (upsert ignoreDuplicates)
        const inserted = count ?? chunk.length
        result.rows_inserted += inserted
        result.rows_skipped += chunk.length - inserted
      }

      result.datasets_processed++
    } catch (err) {
      const msg = `dataset ${ds.id} (${ds.label_pl}): ${err instanceof Error ? err.message : String(err)}`
      result.errors.push(msg)
      result.rows_failed++
      // continue до наступного dataset — one fail не валить весь run
    }
  }

  return result
}
