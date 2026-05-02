// lib/format/cn-code.ts
// Sprint S-INTEL.1.1 — display helper для CN code (Combined Nomenclature 8-digit).
//
// Storage convention (per Vadym Q4 lock 02.05.2026):
//  - DB: без spaces, regex ^[0-9]{8}$ (e.g. "20059990")
//  - UI display: TARIC convention з spaces (e.g. "2005 99 90")
//
// formatCnCode:
//   "20059990"   → "2005 99 90"
//   ""           → ""
//   null         → ""
//   "200599"     → "200599" (повертаємо як є — invalid, але не ламаємо)
//
// parseCnCode (зворотня — strip spaces, для tolerant input):
//   "2005 99 90" → "20059990"
//   "  2005 9990" → "20059990"

export function formatCnCode(code: string | null | undefined): string {
  if (!code) return ''
  const stripped = code.replace(/\s+/g, '')
  if (!/^[0-9]{8}$/.test(stripped)) return code
  return `${stripped.slice(0, 4)} ${stripped.slice(4, 6)} ${stripped.slice(6, 8)}`
}

export function parseCnCode(input: string): string {
  return input.replace(/\s+/g, '')
}

export function isValidCnCode(code: string | null | undefined): boolean {
  if (!code) return false
  return /^[0-9]{8}$/.test(code.replace(/\s+/g, ''))
}
