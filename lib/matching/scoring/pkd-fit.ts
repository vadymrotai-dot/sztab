// lib/matching/scoring/pkd-fit.ts
// Subscore 0-40. Найважливіший компонент.
//
// Levels (top wins) — Sprint G rebalance for tighter signal:
//   • Exact match → 50  (was 40)
//   • Parent/child match (one is prefix of other) → 25
//   • Sector match (first 2 digits — division level) → 10  (was 15)
//   • Same section letter (A-U per PKD-2007/2025 official) → 0  (was 5)
//   • No match → 0
//
// Rationale: section-letter matches were too generous (e.g. food retail vs.
// dry-goods retail в section G could share +5, gave false positives at
// neutral score 50). Rebalance pumps exact matches up, kills section
// noise, gives AI re-score (L6) cleaner gradient on TOP-20.
//
// Format normalization: GUS returns compact ("4725Z"), reference tables
// dotted ("47.25.Z"). Strip dots + uppercase before set comparison.

import type { Subscore } from '../types'

function normalizeCode(code: string): string {
  return code.replace(/[.\s]/g, '').toUpperCase()
}

function division(code: string): string {
  return normalizeCode(code).slice(0, 2)
}

/** Map PKD division (first 2 digits) → section letter (A-U). Per
 *  Eurostat NACE Rev. 2 / PKD-2007/2025 (PL). */
function section(div: string): string {
  const n = parseInt(div, 10)
  if (!Number.isFinite(n)) return '?'
  if (n >= 1 && n <= 3) return 'A' // Rolnictwo
  if (n >= 5 && n <= 9) return 'B' // Górnictwo
  if (n >= 10 && n <= 33) return 'C' // Przetwórstwo
  if (n === 35) return 'D'
  if (n >= 36 && n <= 39) return 'E'
  if (n >= 41 && n <= 43) return 'F'
  if (n >= 45 && n <= 47) return 'G' // Handel
  if (n >= 49 && n <= 53) return 'H' // Transport
  if (n >= 55 && n <= 56) return 'I' // Zakwaterowanie / gastronomia
  if (n >= 58 && n <= 63) return 'J'
  if (n >= 64 && n <= 66) return 'K'
  if (n === 68) return 'L'
  if (n >= 69 && n <= 75) return 'M'
  if (n >= 77 && n <= 82) return 'N'
  if (n === 84) return 'O'
  if (n === 85) return 'P'
  if (n >= 86 && n <= 88) return 'Q'
  if (n >= 90 && n <= 93) return 'R'
  if (n >= 94 && n <= 96) return 'S'
  if (n >= 97 && n <= 98) return 'T'
  if (n === 99) return 'U'
  return '?'
}

export function computePkdFit(
  targetPkds: string[],
  familyTargets: string[],
): Subscore {
  if (targetPkds.length === 0) return { value: 0, reasons: ['pkd_brak_kodów_klienta'] }
  if (familyTargets.length === 0) return { value: 0, reasons: ['pkd_brak_targetów_family'] }

  const tNorm = new Set(targetPkds.map(normalizeCode))
  const fNorm = new Set(familyTargets.map(normalizeCode))

  // Exact
  for (const code of fNorm) {
    if (tNorm.has(code)) {
      return { value: 50, reasons: [`pkd_exact_match:${formatCode(code)}`] }
    }
  }

  // Parent/child
  for (const t of tNorm) {
    for (const f of fNorm) {
      if (t === f) continue
      if (t.startsWith(f) || f.startsWith(t)) {
        return {
          value: 25,
          reasons: [`pkd_parent_child:${formatCode(t)}↔${formatCode(f)}`],
        }
      }
    }
  }

  // Sector (division)
  const tDivs = new Set([...tNorm].map((c) => c.slice(0, 2)))
  const fDivs = new Set([...fNorm].map((c) => c.slice(0, 2)))
  for (const d of fDivs) {
    if (tDivs.has(d)) {
      return { value: 10, reasons: [`pkd_sektor_match:${d}`] }
    }
  }

  // Section-letter intentionally дispatched з 5 → 0 (Sprint G rebalance).
  // Same letter section is too broad signal — too many cross-section ties.
  // Section letter info still computed для potential future debug, але
  // не contributes до score.
  void section // keep helper exported / referenced
  return { value: 0, reasons: ['pkd_brak_dopasowania'] }
}

/** Re-add dots для display: "4725Z" → "47.25.Z" */
function formatCode(code: string): string {
  if (code.length === 5 && /^\d{4}[A-Z]$/.test(code)) {
    return `${code.slice(0, 2)}.${code.slice(2, 4)}.${code.slice(4)}`
  }
  if (code.length === 4 && /^\d{4}$/.test(code)) {
    return `${code.slice(0, 2)}.${code.slice(2)}`
  }
  return code
}
