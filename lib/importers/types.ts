// Shared types for the generic Importer pattern.
// Used by client (parsing+validation) and server (commit) sides.

export type RawRow = Record<string, unknown>
export type ColumnLetter = string // 'A', 'B', ..., 'AA', 'AB', ...
export type FieldName = string

export interface ColumnMapping {
  [field: FieldName]: ColumnLetter
}

export interface ImportPreset {
  columns: ColumnMapping
  header_row: number // 1-indexed (cennik B2B = 18)
  data_start_row: number // 1-indexed (cennik B2B = 19)
  has_category_headers: boolean
  category_header_pattern?: string // regex source. example: '^\\s*▼\\s*(.+)$'
  sheet?: string // optional sheet name (defaults to first)
  options?: Record<string, unknown>
}

export type ValidationSeverity = 'error' | 'warning' | 'ok'

export interface ValidationIssue {
  row: number // 1-indexed in the dataset (after header)
  field: FieldName
  severity: ValidationSeverity
  message: string // польською
}

export interface CanonicalField {
  field: FieldName
  required: boolean
  type: 'string' | 'number' | 'boolean' | 'string[]'
  label: string // польською
  hint?: string // польською
}

export type RowStatus = 'new' | 'duplicate' | 'invalid'

export interface ParsedRow<TRow> {
  raw: RawRow
  parsed: Partial<TRow>
  issues: ValidationIssue[]
  category?: string // last seen category header (▼ KISZONKI)
  status: RowStatus
  rowIndex: number // 1-indexed within the data section
}

export interface ImportResult {
  inserted: number
  updated: number
  skipped: number
  failed: number
  errors?: { row: number; message: string }[]
}

export interface CommitOptions {
  updateExisting: boolean
  supplierId?: string
}
