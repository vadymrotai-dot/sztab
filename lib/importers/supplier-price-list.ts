import { Importer } from './base'
import { letterToIndex, parseXlsx } from './excel-parser'
import {
  isEAN,
  isLikelyGramatura,
  isNonEmptyString,
  toNumberOrNull,
  toStringOrNull,
} from './validation'
import type {
  CanonicalField,
  CommitOptions,
  ImportPreset,
  ImportResult,
  ParsedRow,
  ValidationIssue,
} from './types'

import {
  batchCommitProducts,
  findProductsByEans,
} from '@/app/actions/import'

// Reviewed 2026-04-26: EAN duplicate detection is supplier-scoped
// (findProductsByEans in app/actions/import.ts uses .eq('owner_id')
// .eq('supplier_id') .in('ean') — orphans with supplier_id IS NULL are
// excluded because PG NULL never equals a UUID). Commit with
// updateExisting=true uses UPDATE on the matched id (not INSERT/upsert)
// — see batchCommitProducts. NULL EAN is flagged as invalid in
// validate() below and skipped at commit. No code changes needed.

// Subset of Product fields a supplier price-list provides. Server commit
// fills in owner_id, supplier_id, computed cost_pln, and any auto prices
// from settings. We keep the type narrow on purpose.
export interface ImportedProductDraft {
  name: string
  gramatura: string | null
  ean: string | null
  cost_eur: number | null
  category: string | null
  is_hero: boolean | null
  seasonality_status: string | null
  tags: string[] | null
}

export class SupplierPriceListImporter extends Importer<ImportedProductDraft> {
  constructor(public supplierId: string) {
    super()
  }

  canonicalSchema: CanonicalField[] = [
    { field: 'name', required: true, type: 'string', label: 'Nazwa produktu' },
    { field: 'gramatura', required: false, type: 'string', label: 'Gramatura', hint: 'np. 3000 g, 500g / ~300g' },
    { field: 'ean', required: true, type: 'string', label: 'EAN', hint: '8, 12 lub 13 cyfr' },
    { field: 'cost_eur', required: true, type: 'number', label: 'Koszt EUR', hint: 'cena zakupu od dostawcy' },
    { field: 'category', required: false, type: 'string', label: 'Kategoria' },
    { field: 'is_hero', required: false, type: 'boolean', label: 'Hero (★)', hint: 'kolumna ze statusem' },
    { field: 'seasonality_status', required: false, type: 'string', label: 'Status sezonowy' },
  ]

  async parse(
    file: File,
    preset: ImportPreset,
  ): Promise<ParsedRow<ImportedProductDraft>[]> {
    const { sheets, defaultSheet } = await parseXlsx(file)
    const sheetName = preset.sheet ?? defaultSheet
    const matrix = sheets[sheetName] ?? []

    const startIdx = preset.data_start_row - 1 // matrix is 0-indexed
    const categoryRegex = preset.has_category_headers
      ? new RegExp(preset.category_header_pattern ?? '^\\s*▼\\s*(.+)$')
      : null

    const result: ParsedRow<ImportedProductDraft>[] = []
    let currentCategory: string | undefined
    let dataRowCounter = 0

    for (let i = startIdx; i < matrix.length; i++) {
      const row = matrix[i] ?? []
      // Treat fully blank rows as separators.
      const allEmpty = row.every((c) => c == null || c === '')
      if (allEmpty) continue

      // Category header detection: first column has a single-cell text
      // matching the pattern (e.g. "▼ KISZONKI Z KAPUSTY").
      if (categoryRegex) {
        const firstText = row.find((c) => typeof c === 'string') as
          | string
          | undefined
        if (firstText) {
          const m = firstText.match(categoryRegex)
          if (m) {
            currentCategory = m[1]?.trim() || firstText.trim()
            continue
          }
        }
      }

      dataRowCounter++

      const cellAt = (letter: ColumnLetterOrUndef) =>
        letter ? row[letterToIndex(letter)] : undefined

      const name = toStringOrNull(cellAt(preset.columns.name))
      // skip if name column is empty AND this isn't a category-only row
      if (!name) continue

      const gramatura = toStringOrNull(cellAt(preset.columns.gramatura))
      const ean = toStringOrNull(cellAt(preset.columns.ean))
      const costEur = toNumberOrNull(cellAt(preset.columns.cost_eur))
      const categoryFromColumn = toStringOrNull(
        cellAt(preset.columns.category),
      )
      const statusRaw = toStringOrNull(cellAt(preset.columns.is_hero))

      const isHero = statusRaw ? /★|✓|hero|bestseller|top/i.test(statusRaw) : null
      const seasonality = toStringOrNull(cellAt(preset.columns.seasonality_status))

      const draft: ImportedProductDraft = {
        name,
        gramatura,
        ean,
        cost_eur: costEur,
        category: categoryFromColumn ?? currentCategory ?? null,
        is_hero: isHero,
        seasonality_status: seasonality,
        tags: isHero ? ['bestseller'] : null,
      }

      result.push({
        raw: row.reduce<Record<string, unknown>>((acc, val, idx) => {
          acc[String(idx)] = val
          return acc
        }, {}),
        parsed: draft,
        issues: [],
        category: currentCategory,
        status: 'new',
        rowIndex: dataRowCounter,
      })
    }

    return result
  }

  async validate(
    rows: ParsedRow<ImportedProductDraft>[],
  ): Promise<ParsedRow<ImportedProductDraft>[]> {
    return rows.map((r) => {
      const issues: ValidationIssue[] = []
      const p = r.parsed

      if (!isNonEmptyString(p.name) || (p.name?.length ?? 0) < 3) {
        issues.push({
          row: r.rowIndex,
          field: 'name',
          severity: 'error',
          message: 'Nazwa wymagana (min 3 znaki)',
        })
      }
      if (p.gramatura && !isLikelyGramatura(p.gramatura)) {
        issues.push({
          row: r.rowIndex,
          field: 'gramatura',
          severity: 'warning',
          message: `Nietypowy format gramatury: "${p.gramatura}"`,
        })
      }
      if (!p.ean || !isEAN(p.ean)) {
        issues.push({
          row: r.rowIndex,
          field: 'ean',
          severity: 'error',
          message: 'EAN wymagany — 8, 12 lub 13 cyfr',
        })
      }
      if (p.cost_eur == null || p.cost_eur <= 0) {
        issues.push({
          row: r.rowIndex,
          field: 'cost_eur',
          severity: 'error',
          message: 'Koszt EUR wymagany i > 0',
        })
      }

      const status = issues.some((i) => i.severity === 'error')
        ? 'invalid'
        : r.status
      return { ...r, issues, status }
    })
  }

  async findDuplicates(
    rows: ParsedRow<ImportedProductDraft>[],
  ): Promise<ParsedRow<ImportedProductDraft>[]> {
    const eans = rows
      .map((r) => r.parsed.ean)
      .filter((e): e is string => typeof e === 'string' && e.length > 0)
    if (eans.length === 0) return rows

    const existing = await findProductsByEans(eans, this.supplierId)
    return rows.map((r) => {
      const ean = r.parsed.ean
      if (!ean) return r
      if (r.status === 'invalid') return r
      const existingId = existing[ean]
      return existingId ? { ...r, status: 'duplicate' as const } : r
    })
  }

  async commit(
    rows: ParsedRow<ImportedProductDraft>[],
    options: CommitOptions,
  ): Promise<ImportResult> {
    return batchCommitProducts(
      rows.map((r) => ({
        ean: r.parsed.ean,
        draft: r.parsed,
        status: r.status,
      })),
      { ...options, supplierId: this.supplierId },
    )
  }
}

type ColumnLetterOrUndef = string | undefined
