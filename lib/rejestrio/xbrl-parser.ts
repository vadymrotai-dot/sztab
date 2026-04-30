// lib/rejestrio/xbrl-parser.ts
// Sprint S1 Phase 2 — recursive XBRL JSON tree → structured fields.
//
// Input (z /krs-dokumenty/{id}?format=json body.zawartosc):
//   { nazwa_wezla, etykieta, pln_rok_obrotowy_biezacy, pln_rok_obrotowy_poprzedni,
//     podobiekty: [...] }
//
// Strategy: recursive search для nodes matching label patterns.

interface XBRLNode {
  nazwa_wezla?: string
  etykieta?: string
  podetykieta?: string | null
  pln_rok_obrotowy_biezacy?: string | null
  pln_rok_obrotowy_poprzedni?: string | null
  podobiekty?: XBRLNode[] | null
}

function parsePln(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v).replace(/\s|,/g, '.'))
  return Number.isFinite(n) ? n : null
}

/** Match node label against a list of label patterns (case-insensitive
 *  substring match). Returns first matching node lub null. */
function findNode(
  root: XBRLNode | null | undefined,
  patterns: string[],
): XBRLNode | null {
  if (!root) return null
  const stack: XBRLNode[] = [root]
  const lowered = patterns.map((p) => p.toLowerCase())
  while (stack.length > 0) {
    const node = stack.pop()!
    const label = (node.etykieta ?? '').toLowerCase()
    if (lowered.some((p) => label.includes(p))) return node
    if (node.podobiekty && Array.isArray(node.podobiekty)) {
      for (const child of node.podobiekty) stack.push(child)
    }
  }
  return null
}

export interface XBRLDocument {
  id_organizacji?: string
  id_dokumentu?: string
  nazwa?: string
  okres_data_start?: string
  okres_data_koniec?: string
  zawartosc?: XBRLNode
}

export interface ExtractedFinancials {
  przychody_netto: number | null
  zysk_netto: number | null
  aktywa_razem: number | null
  liczba_pracownikow: number | null
}

/** Extract z RZiS (Rachunek zysków i strat) document */
export function extractRzisFields(doc: XBRLDocument): ExtractedFinancials {
  const root = doc.zawartosc
  const przychodyNode = findNode(root, [
    'przychody netto ze sprzedaży i zrównane z nimi',
    'przychody ze sprzedaży',
  ])
  const zyskNode = findNode(root, ['zysk (strata) netto', 'zysk netto'])
  // Aktywa razem only у Bilans, не RZiS — leave null here
  return {
    przychody_netto: parsePln(przychodyNode?.pln_rok_obrotowy_biezacy),
    zysk_netto: parsePln(zyskNode?.pln_rok_obrotowy_biezacy),
    aktywa_razem: null,
    liczba_pracownikow: null,
  }
}

/** Extract з Bilans document */
export function extractBilansFields(doc: XBRLDocument): ExtractedFinancials {
  const root = doc.zawartosc
  const aktywaNode = findNode(root, ['aktywa razem', 'suma aktywów'])
  return {
    przychody_netto: null,
    zysk_netto: null,
    aktywa_razem: parsePln(aktywaNode?.pln_rok_obrotowy_biezacy),
    liczba_pracownikow: null,
  }
}

/** Merge extracts з multiple documents per fiscal year. */
export function mergeFinancials(
  ...extracts: ExtractedFinancials[]
): ExtractedFinancials {
  return {
    przychody_netto: extracts.find((e) => e.przychody_netto !== null)?.przychody_netto ?? null,
    zysk_netto: extracts.find((e) => e.zysk_netto !== null)?.zysk_netto ?? null,
    aktywa_razem: extracts.find((e) => e.aktywa_razem !== null)?.aktywa_razem ?? null,
    liczba_pracownikow:
      extracts.find((e) => e.liczba_pracownikow !== null)?.liczba_pracownikow ?? null,
  }
}
