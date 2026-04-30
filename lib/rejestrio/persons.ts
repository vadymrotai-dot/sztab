// lib/rejestrio/persons.ts
// Sprint S1 Phase 2 — fetch /osoby/{id} dla real names (Biznes plan).
// Returns null on 404 (person not Biznes-accessible).

import { rejestrioGet, RejestrioError } from './client'

interface OsobaRaw {
  id?: number
  tozsamosc?: {
    imie?: string
    nazwisko?: string
    imiona_i_nazwisko?: string
    plec?: string
    data_urodzenia?: string
  }
  typ?: string
  krs_powiazania_liczby?: { aktualne?: number; przeszle?: number }
  organizacje_skrot?: Array<{ id: number; nazwa_skrocona: string }>
}

export interface OsobaDetail {
  rejestrio_person_id: number
  imie: string | null
  nazwisko: string | null
  plec: string | null
  data_urodzenia: string | null
  /** True jeśli imie/nazwisko look like RODO-anon placeholder */
  is_anon_placeholder: boolean
  raw: OsobaRaw
}

const ANON_RE = /^[*•_]+$|^[A-Za-z]\*+$/

export async function fetchOsobaDetail(
  apiKey: string,
  personId: number | string,
): Promise<OsobaDetail | null> {
  try {
    const raw = await rejestrioGet<OsobaRaw>(apiKey, `/osoby/${personId}`)
    const t = raw.tozsamosc
    const imie = t?.imie ?? null
    const nazwisko = t?.nazwisko ?? null
    return {
      rejestrio_person_id: Number(raw.id ?? personId),
      imie,
      nazwisko,
      plec: t?.plec ?? null,
      data_urodzenia: t?.data_urodzenia ?? null,
      is_anon_placeholder:
        Boolean(imie && ANON_RE.test(imie)) ||
        Boolean(nazwisko && ANON_RE.test(nazwisko)),
      raw,
    }
  } catch (err) {
    if (err instanceof RejestrioError && err.status === 404) return null
    throw err
  }
}
