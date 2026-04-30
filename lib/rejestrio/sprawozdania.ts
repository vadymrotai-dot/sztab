// lib/rejestrio/sprawozdania.ts
// Sprint S1 Phase 2 — list dokumenty per year + fetch XBRL JSON dla each
// czy_ma_json=true doc, merge into per-year financial_statements rows.

import { rejestrioGet, RejestrioError } from './client'
import {
  extractRzisFields,
  extractBilansFields,
  mergeFinancials,
  type ExtractedFinancials,
  type XBRLDocument,
} from './xbrl-parser'

interface DocListItem {
  id: number | string
  nazwa: string
  czy_ma_json: boolean
}

interface YearGroup {
  data_start: string
  data_koniec: string
  dokumenty: DocListItem[]
}

export interface YearFinancials {
  okres_data_start: string
  okres_data_koniec: string
  fields: ExtractedFinancials
  /** First doc id used (для traceability) */
  primary_doc_id: number | null
  raw_xbrl_combined: { rzis: unknown; bilans: unknown } | null
}

export async function fetchAllFinancials(
  apiKey: string,
  krs: string,
): Promise<YearFinancials[]> {
  let years: YearGroup[]
  try {
    years = await rejestrioGet<YearGroup[]>(apiKey, `/org/${krs}/krs-dokumenty`)
  } catch (err) {
    if (err instanceof RejestrioError && err.status === 404) return []
    throw err
  }
  if (!Array.isArray(years)) return []

  const out: YearFinancials[] = []
  for (const yg of years) {
    const rzisDoc = yg.dokumenty.find(
      (d) => d.czy_ma_json && /rachunek zysków/i.test(d.nazwa),
    )
    const bilansDoc = yg.dokumenty.find(
      (d) => d.czy_ma_json && /bilans/i.test(d.nazwa),
    )
    if (!rzisDoc && !bilansDoc) continue

    const extracts: ExtractedFinancials[] = []
    let primaryDocId: number | null = null
    let rzisRaw: unknown = null
    let bilansRaw: unknown = null

    if (rzisDoc) {
      try {
        const doc = await rejestrioGet<XBRLDocument>(
          apiKey,
          `/org/${krs}/krs-dokumenty/${rzisDoc.id}?format=json`,
        )
        extracts.push(extractRzisFields(doc))
        rzisRaw = doc
        primaryDocId = Number(rzisDoc.id)
      } catch (err) {
        console.warn(
          `[sprawozdania] RZiS ${rzisDoc.id} fail:`,
          err instanceof Error ? err.message : err,
        )
      }
    }
    if (bilansDoc) {
      try {
        const doc = await rejestrioGet<XBRLDocument>(
          apiKey,
          `/org/${krs}/krs-dokumenty/${bilansDoc.id}?format=json`,
        )
        extracts.push(extractBilansFields(doc))
        bilansRaw = doc
        if (primaryDocId === null) primaryDocId = Number(bilansDoc.id)
      } catch (err) {
        console.warn(
          `[sprawozdania] Bilans ${bilansDoc.id} fail:`,
          err instanceof Error ? err.message : err,
        )
      }
    }
    if (extracts.length === 0) continue

    out.push({
      okres_data_start: yg.data_start,
      okres_data_koniec: yg.data_koniec,
      fields: mergeFinancials(...extracts),
      primary_doc_id: primaryDocId,
      raw_xbrl_combined: { rzis: rzisRaw, bilans: bilansRaw },
    })
  }
  return out
}
