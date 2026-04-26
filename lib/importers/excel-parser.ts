import * as XLSX from 'xlsx'

// 2-D matrix of cell values. Inner arrays are sparse (xlsx returns
// `null` / `undefined` for empty cells in the middle).
export type SheetMatrix = unknown[][]

export interface ParsedWorkbook {
  sheets: Record<string, SheetMatrix>
  defaultSheet: string
}

// Reads an XLSX (or XLS / CSV — sheetjs sniffs) into a sheet→matrix map.
// Runs in the browser via SheetJS; do NOT call from a server context.
export async function parseXlsx(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheets: Record<string, SheetMatrix> = {}
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name]
    if (!ws) continue
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    }) as SheetMatrix
    sheets[name] = matrix
  }
  return {
    sheets,
    defaultSheet: workbook.SheetNames[0] ?? '',
  }
}

// Convert column letter ('A', 'B', ..., 'AA') to 0-indexed column number.
export function letterToIndex(letter: string): number {
  let index = 0
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + (letter.toUpperCase().charCodeAt(i) - 64)
  }
  return index - 1
}

export function indexToLetter(index: number): string {
  let letter = ''
  let n = index + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    letter = String.fromCharCode(65 + rem) + letter
    n = Math.floor((n - 1) / 26)
  }
  return letter
}

// Find the row index that most likely contains column headers — at least
// `minTextCells` cells where each cell is a short string with no embedded
// digits. Returns 0-indexed row; -1 if nothing looks like a header.
export function detectHeaderRow(
  rows: SheetMatrix,
  minTextCells = 3,
): number {
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i] ?? []
    const headerLikeCells = row.filter((cell) => {
      if (typeof cell !== 'string') return false
      const t = cell.trim()
      if (!t) return false
      if (t.length > 60) return false
      // headers usually don't contain decimal / multi-digit numbers
      if (/\d{2,}/.test(t)) return false
      return true
    }).length
    if (headerLikeCells >= minTextCells) return i
  }
  return -1
}

export function workbookToBlob(wb: XLSX.WorkBook): Blob {
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export { XLSX }
