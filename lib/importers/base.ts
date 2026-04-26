import type {
  CanonicalField,
  CommitOptions,
  ImportPreset,
  ImportResult,
  ParsedRow,
} from './types'

// Generic importer contract. Future importers (WMS stock exports, partner
// price lists, contacts bulk) implement this same surface so the wizard
// UI doesn't need to change shape per importer kind.
export abstract class Importer<TRow> {
  abstract canonicalSchema: CanonicalField[]
  abstract parse(file: File, preset: ImportPreset): Promise<ParsedRow<TRow>[]>
  abstract validate(rows: ParsedRow<TRow>[]): Promise<ParsedRow<TRow>[]>
  abstract findDuplicates(rows: ParsedRow<TRow>[]): Promise<ParsedRow<TRow>[]>
  abstract commit(
    rows: ParsedRow<TRow>[],
    options: CommitOptions,
  ): Promise<ImportResult>
}
