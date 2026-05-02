// scripts/diag-zsrir-912.ts
// Sprint S-INTEL.1.2.1 diagnostic — analyze actual xlsx structure для
// dataset 912 (owoce/warzywa świeże) перш ніж edit parseOwoceWarzywa
// у lib/intelligence/zsrir.ts.
//
// Issue 1: parseOwoceWarzywa returned 0 rows — heuristics не match real
// 2026 xlsx layout. Цей diag dumps actual sheet/row/cell structure щоб
// drive parser update.
//
// Prerequisite — Vadym downloads latest xlsx:
//   cd C:\Users\vadym\Projects\sztab\scripts\cowork
//   $url = (Invoke-RestMethod "https://api.dane.gov.pl/1.4/datasets/912/resources?per_page=3&sort=-created").data[0].attributes.file_url
//   Invoke-WebRequest -Uri $url -OutFile "zsrir-912-2026-05-02.xlsx"
//
// Run:
//   pnpm exec tsx scripts/diag-zsrir-912.ts
//   pnpm exec tsx scripts/diag-zsrir-912.ts scripts/cowork/zsrir-912-2026-05-02.xlsx
//
// Output: paste console output до chat — Cowork updates parseOwoceWarzywa.

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as XLSX from 'xlsx'

const LABEL_KEYWORDS = [
  'kapusta',
  'pomidor',
  'ogórek',
  'ogorek',
  'burak',
  'cebula',
  'marchew',
  'jabłka',
  'jablka',
  'ziemniaki',
]

function findLatestXlsx(): string | null {
  const dir = path.resolve(process.cwd(), 'scripts', 'cowork')
  if (!fs.existsSync(dir)) return null
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^zsrir-912.*\.xlsx$/i.test(f))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(dir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)
  return files.length > 0 ? path.join(dir, files[0].name) : null
}

function asString(c: unknown): string {
  if (c == null) return ''
  return String(c)
}

function isLabelCandidate(cell: unknown): boolean {
  if (typeof cell !== 'string') return false
  const lower = cell.toLowerCase()
  return LABEL_KEYWORDS.some((kw) => lower.includes(kw))
}

function isPriceCandidate(cell: unknown): boolean {
  let num: number | null = null
  if (typeof cell === 'number') {
    num = Number.isFinite(cell) ? cell : null
  } else if (typeof cell === 'string') {
    const cleaned = cell.replace(/\s+/g, '').replace(',', '.')
    const parsed = parseFloat(cleaned)
    num = Number.isFinite(parsed) ? parsed : null
  }
  return num !== null && num >= 0.5 && num <= 50
}

function previewCell(cell: unknown): string {
  if (cell == null) return ''
  const s = String(cell)
  return s.length > 30 ? s.slice(0, 28) + '..' : s
}

async function main() {
  const arg = process.argv[2]
  const filePath = arg ?? findLatestXlsx()
  if (!filePath) {
    console.error(
      '❌ No xlsx found. Pass path arg або download to scripts/cowork/zsrir-912-*.xlsx',
    )
    console.error('   Help: pnpm exec tsx scripts/diag-zsrir-912.ts <path-to-xlsx>')
    process.exit(1)
  }
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    process.exit(1)
  }

  console.log('\n══════ ZSRIR 912 xlsx structure diag ══════\n')
  console.log(`File: ${filePath}`)
  console.log(`Size: ${(fs.statSync(filePath).size / 1024).toFixed(1)} KB`)

  const buf = fs.readFileSync(filePath)
  const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true })

  console.log(`\nSheet count: ${workbook.SheetNames.length}`)
  console.log(`Sheets: ${workbook.SheetNames.join(' | ')}`)

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    })

    console.log(`\n──────── Sheet: "${sheetName}" ────────`)
    console.log(`Total rows: ${data.length}`)

    // Max columns observed
    const maxCols = data.reduce<number>(
      (m, r) => Math.max(m, Array.isArray(r) ? r.length : 0),
      0,
    )
    console.log(`Max columns: ${maxCols}`)

    // First 15 rows preview
    console.log('\nFirst 15 rows (col index → cell):')
    const previewLimit = Math.min(15, data.length)
    for (let i = 0; i < previewLimit; i++) {
      const row = (data[i] ?? []) as unknown[]
      const cells = row
        .slice(0, 8)
        .map((c, idx) => `[${idx}]${previewCell(c)}`)
        .join(' | ')
      console.log(`  row ${String(i).padStart(2, ' ')}: ${cells}`)
    }

    // Label candidate analysis — для each column, count rows containing keyword
    console.log('\nLabel keyword hits per column (kapusta/pomidor/ogórek/burak/...):')
    const labelHits: number[] = new Array(maxCols).fill(0)
    const exampleByCol: Map<number, string[]> = new Map()
    for (let i = 0; i < data.length; i++) {
      const row = (data[i] ?? []) as unknown[]
      for (let j = 0; j < row.length; j++) {
        if (isLabelCandidate(row[j])) {
          labelHits[j]++
          const ex = exampleByCol.get(j) ?? []
          if (ex.length < 3) ex.push(asString(row[j]))
          exampleByCol.set(j, ex)
        }
      }
    }
    labelHits.forEach((cnt, idx) => {
      if (cnt > 0) {
        const examples = (exampleByCol.get(idx) ?? []).join(', ')
        console.log(`  col[${idx}]: ${cnt} hits — examples: ${examples}`)
      }
    })

    // Price candidate analysis — для each column, count cells у range 0.5..50
    console.log('\nPrice candidate cells per column (numeric у 0.5..50 range):')
    const priceHits: number[] = new Array(maxCols).fill(0)
    const priceExampleByCol: Map<number, string[]> = new Map()
    for (let i = 0; i < data.length; i++) {
      const row = (data[i] ?? []) as unknown[]
      for (let j = 0; j < row.length; j++) {
        if (isPriceCandidate(row[j])) {
          priceHits[j]++
          const ex = priceExampleByCol.get(j) ?? []
          if (ex.length < 3) ex.push(asString(row[j]))
          priceExampleByCol.set(j, ex)
        }
      }
    }
    priceHits.forEach((cnt, idx) => {
      if (cnt > 0) {
        const examples = (priceExampleByCol.get(idx) ?? []).join(', ')
        console.log(`  col[${idx}]: ${cnt} hits — examples: ${examples}`)
      }
    })

    // Header row guess: row з найбільшою кількістю tetст cells (>3 string з length>2)
    console.log('\nHeader row guesses (row index — text-cell count — preview):')
    const headerCandidates: Array<{ idx: number; textCount: number; preview: string }> = []
    for (let i = 0; i < Math.min(data.length, 20); i++) {
      const row = (data[i] ?? []) as unknown[]
      const textCount = row.filter(
        (c) => typeof c === 'string' && c.trim().length > 2 && !/^[\d.,\s]+$/.test(c),
      ).length
      if (textCount >= 3) {
        const preview = row
          .slice(0, 6)
          .map((c) => previewCell(c))
          .join(' | ')
        headerCandidates.push({ idx: i, textCount, preview })
      }
    }
    headerCandidates
      .sort((a, b) => b.textCount - a.textCount)
      .slice(0, 5)
      .forEach((h) => {
        console.log(`  row[${h.idx}] (textCount=${h.textCount}): ${h.preview}`)
      })

    console.log('') // blank line between sheets
  }

  console.log('══════ End diag ══════')
  console.log('\nNext: paste console output above до Cowork chat — Cowork')
  console.log('updates parseOwoceWarzywa() з actual header row + column indices.')
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
