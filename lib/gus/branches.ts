// lib/gus/branches.ts
// Sprint S1 Phase 3 — fetch BIR11OsPrawnaListaJednLokalnych report,
// parse jednostki lokalne records into structured branch data.

import { gusGetReport, type ReportType } from '@/lib/enrichment/gus'

interface JednostkaRaw {
  praw_jednLokalnaRegon?: string
  praw_jednLokalnaNazwa?: string
  praw_jednLokalnaAdSiedzKraj_Nazwa?: string
  praw_jednLokalnaAdSiedzWojewodztwo_Nazwa?: string
  praw_jednLokalnaAdSiedzPowiat_Nazwa?: string
  praw_jednLokalnaAdSiedzGmina_Nazwa?: string
  praw_jednLokalnaAdSiedzMiejscowosc_Nazwa?: string
  praw_jednLokalnaAdSiedzKodPocztowy?: string
  praw_jednLokalnaAdSiedzUlica_Nazwa?: string
  praw_jednLokalnaAdSiedzNumerNieruchomosci?: string
  praw_jednLokalnaAdSiedzNumerLokalu?: string
  praw_jednLokalnaDataRozpoczeciaDzialalnosci?: string
  praw_jednLokalnaDataZakonczeniaDzialalnosci?: string
  // Fizyczna mirror
  fiz_jednLokalnaRegon?: string
  fiz_jednLokalnaNazwa?: string
  [k: string]: unknown
}

export interface ParsedBranch {
  regon_jednostki: string | null
  nazwa: string | null
  adres: {
    kraj?: string
    wojewodztwo?: string
    powiat?: string
    gmina?: string
    miejscowosc?: string
    kod_pocztowy?: string
    ulica?: string
    nr_domu?: string
    nr_lokalu?: string
  }
  data_rozpoczecia: string | null
  status: 'AKTYWNA' | 'ZAKONCZONA'
}

function pickStr(o: JednostkaRaw, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

function parseJednostka(o: JednostkaRaw): ParsedBranch {
  const regon = pickStr(o, 'praw_jednLokalnaRegon', 'fiz_jednLokalnaRegon')
  const nazwa = pickStr(o, 'praw_jednLokalnaNazwa', 'fiz_jednLokalnaNazwa')
  const dataKonc = pickStr(
    o,
    'praw_jednLokalnaDataZakonczeniaDzialalnosci',
    'fiz_jednLokalnaDataZakonczeniaDzialalnosci',
  )
  const dataRozp = pickStr(
    o,
    'praw_jednLokalnaDataRozpoczeciaDzialalnosci',
    'fiz_jednLokalnaDataRozpoczeciaDzialalnosci',
  )
  return {
    regon_jednostki: regon,
    nazwa,
    adres: {
      kraj: pickStr(o, 'praw_jednLokalnaAdSiedzKraj_Nazwa') ?? undefined,
      wojewodztwo: pickStr(o, 'praw_jednLokalnaAdSiedzWojewodztwo_Nazwa') ?? undefined,
      powiat: pickStr(o, 'praw_jednLokalnaAdSiedzPowiat_Nazwa') ?? undefined,
      gmina: pickStr(o, 'praw_jednLokalnaAdSiedzGmina_Nazwa') ?? undefined,
      miejscowosc: pickStr(o, 'praw_jednLokalnaAdSiedzMiejscowosc_Nazwa') ?? undefined,
      kod_pocztowy: pickStr(o, 'praw_jednLokalnaAdSiedzKodPocztowy') ?? undefined,
      ulica: pickStr(o, 'praw_jednLokalnaAdSiedzUlica_Nazwa') ?? undefined,
      nr_domu: pickStr(o, 'praw_jednLokalnaAdSiedzNumerNieruchomosci') ?? undefined,
      nr_lokalu: pickStr(o, 'praw_jednLokalnaAdSiedzNumerLokalu') ?? undefined,
    },
    data_rozpoczecia: dataRozp,
    status: dataKonc ? 'ZAKONCZONA' : 'AKTYWNA',
  }
}

/** Fetch ListaJednLokalnych report and parse. Returns [] if ErrorCode 4
 *  ("Nie znaleziono") OR no entries — indicates company has no branches. */
export async function fetchBranches(
  sessionId: string,
  regon: string,
  silosId: string | undefined,
): Promise<ParsedBranch[]> {
  const reportType: ReportType =
    silosId === '6' ? 'BIR11OsPrawnaListaJednLokalnych' : 'BIR11OsFizycznaListaJednLokalnych'
  // ts-typed-only — fizyczna report not on enum; cast тhrough unknown
  const inner = await gusGetReport(sessionId, regon, reportType as ReportType)
  if (!inner || typeof inner !== 'object') return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dane = ((inner as any)?.root?.dane) as unknown
  if (!dane) return []

  // ErrorCode 4 case: dane is single object з ErrorCode field
  if (
    typeof dane === 'object' &&
    !Array.isArray(dane) &&
    'ErrorCode' in (dane as Record<string, unknown>)
  ) {
    return []
  }

  // Array of jednostki OR single jednostka object
  const list: JednostkaRaw[] = Array.isArray(dane)
    ? (dane as JednostkaRaw[])
    : [dane as JednostkaRaw]
  return list.map(parseJednostka).filter((b) => b.regon_jednostki !== null)
}
