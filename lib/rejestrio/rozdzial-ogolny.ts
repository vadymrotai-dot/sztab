// lib/rejestrio/rozdzial-ogolny.ts
// Sprint S1 Phase 2 — extract structured fields from /krs-rozdzialy/ogolny.
// Field shape: every value wrapped у {_wartosc, _zakres: {wpis_wprowadzajacy_numer,
// wpis_wprowadzajacy_data}}. Helper unwraps recursively.

import { rejestrioGet } from './client'

interface Wrapped<T> {
  _wartosc?: T
  _zakres?: { wpis_wprowadzajacy_numer?: number; wpis_wprowadzajacy_data?: string }
  _obiekty?: Record<string, unknown>
}

interface OgolnyRaw {
  forma_prawna?: Wrapped<string>
  nip?: Wrapped<string>
  regon?: Wrapped<string>
  nazwa?: Wrapped<string>
  nazwa_krotka?: Wrapped<string>
  email?: Wrapped<string>
  www?: Wrapped<string>
  adres_strony_internetowej?: Wrapped<string>
  opp?: Wrapped<boolean>
  data_dokonania_wpisu?: Wrapped<string>
  data_zarejestrowania?: Wrapped<string>
  zawieszenie_dzialalnosci?: Wrapped<unknown>
  kapital_zakladowy?: Wrapped<{ wartosc?: string | number; waluta?: string }>
  kapital_akcyjny?: Wrapped<{ wartosc?: string | number; waluta?: string }>
  organ_reprezentacji?: Wrapped<unknown>
  prokurenci?: Wrapped<unknown>
  dane_wspolnikow?: Wrapped<unknown>
  przedmiot_przewazajacej_dzialalnosci?: Wrapped<unknown>
  przedmiot_pozostalej_dzialalnosci?: Wrapped<unknown>
  adres?: Wrapped<unknown>
  adres_znormalizowany?: Wrapped<unknown>
  siedziba?: Wrapped<string>
  [k: string]: unknown
}

export interface OgolnyExtracted {
  email_krs: string | null
  website_krs: string | null
  kapital_zakladowy: number | null
  kapital_akcyjny: number | null
  opp_status: boolean
  founded_at: string | null
  suspended_at: string | null
  forma_prawna: string | null
  /** Persons na podstawie organ_reprezentacji.dane_osob */
  zarzad: ExtractedPerson[]
  prokurenci: ExtractedPerson[]
  wspolnicy: ExtractedPerson[]
  raw: OgolnyRaw
}

export interface ExtractedPerson {
  rejestrio_person_id: number | null
  imie: string | null
  nazwisko: string | null
  funkcja: string | null
  data_urodzenia: string | null
  plec: string | null
  /** Source organ ('zarzad'|'prokura'|'wspolnik') */
  rola_typ: 'zarzad' | 'prokura' | 'wspolnik'
}

function unwrap<T>(w: Wrapped<T> | undefined): T | null {
  if (!w) return null
  if (w._wartosc !== undefined) return w._wartosc as T
  return null
}

function parseMoney(w: Wrapped<{ wartosc?: string | number; waluta?: string }> | undefined): number | null {
  const v = unwrap(w)
  if (!v) return null
  const wartosc = (v as { wartosc?: string | number }).wartosc
  if (wartosc === undefined || wartosc === null) return null
  const n = typeof wartosc === 'string' ? parseFloat(wartosc.replace(/\s|,/g, '.')) : Number(wartosc)
  return Number.isFinite(n) ? n : null
}

function parsePolishDate(s: string | null): string | null {
  if (!s) return null
  // "17. 06. 2022r." OR "17.06.2022" OR "2022-06-17"
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const pl = s.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/)
  if (pl) return `${pl[3]}-${pl[2]!.padStart(2, '0')}-${pl[1]!.padStart(2, '0')}`
  return null
}

function extractPersonsFromObiekty(
  organField: Wrapped<unknown> | undefined,
  rola_typ: 'zarzad' | 'prokura' | 'wspolnik',
): ExtractedPerson[] {
  const out: ExtractedPerson[] = []
  if (!organField?._obiekty) return out
  for (const organ of Object.values(organField._obiekty)) {
    const o = organ as { dane_osob?: Wrapped<unknown> }
    if (!o.dane_osob?._obiekty) continue
    for (const personEntry of Object.values(o.dane_osob._obiekty)) {
      const pe = personEntry as {
        person?: Wrapped<{
          imie?: string
          nazwisko?: string
          id?: string | number
          plec?: string
          data_urodzenia?: string
        }>
        funkcja_w_organie?: Wrapped<{ nazwa?: string }>
      }
      const person = unwrap(pe.person)
      const funkcja = unwrap(pe.funkcja_w_organie)
      if (!person) continue
      out.push({
        rejestrio_person_id: person.id ? Number(person.id) : null,
        imie: person.imie ?? null,
        nazwisko: person.nazwisko ?? null,
        funkcja: funkcja?.nazwa ?? null,
        data_urodzenia: person.data_urodzenia ?? null,
        plec: person.plec ?? null,
        rola_typ,
      })
    }
  }
  return out
}

function extractWspolnicy(field: Wrapped<unknown> | undefined): ExtractedPerson[] {
  const out: ExtractedPerson[] = []
  if (!field?._obiekty) return out
  for (const wspolnikEntry of Object.values(field._obiekty)) {
    const we = wspolnikEntry as {
      person?: Wrapped<{
        imie?: string
        nazwisko?: string
        id?: string | number
        plec?: string
        data_urodzenia?: string
      }>
    }
    const person = unwrap(we.person)
    if (!person) continue
    out.push({
      rejestrio_person_id: person.id ? Number(person.id) : null,
      imie: person.imie ?? null,
      nazwisko: person.nazwisko ?? null,
      funkcja: 'Wspólnik',
      data_urodzenia: person.data_urodzenia ?? null,
      plec: person.plec ?? null,
      rola_typ: 'wspolnik',
    })
  }
  return out
}

export async function fetchRozdzialOgolny(
  apiKey: string,
  krs: string,
): Promise<OgolnyExtracted> {
  const raw = await rejestrioGet<OgolnyRaw>(apiKey, `/org/${krs}/krs-rozdzialy/ogolny`)

  // zawieszenie — if has _obiekty з wartosc.data_start_zawieszenia, set suspended_at
  let suspended_at: string | null = null
  const susp = raw.zawieszenie_dzialalnosci
  if (susp?._obiekty) {
    for (const entry of Object.values(susp._obiekty)) {
      const e = entry as { _wartosc?: { data_start_zawieszenia?: string; data_zakonczenia_zawieszenia?: string } }
      const v = e._wartosc
      if (v?.data_start_zawieszenia && !v.data_zakonczenia_zawieszenia) {
        suspended_at = parsePolishDate(v.data_start_zawieszenia)
        break
      }
    }
  }

  return {
    email_krs: unwrap(raw.email)?.toLowerCase() ?? null,
    website_krs: unwrap(raw.www) ?? unwrap(raw.adres_strony_internetowej) ?? null,
    kapital_zakladowy: parseMoney(raw.kapital_zakladowy),
    kapital_akcyjny: parseMoney(raw.kapital_akcyjny),
    opp_status: unwrap(raw.opp) === true,
    founded_at: parsePolishDate(unwrap(raw.data_zarejestrowania) ?? unwrap(raw.data_dokonania_wpisu)),
    suspended_at,
    forma_prawna: unwrap(raw.forma_prawna),
    zarzad: extractPersonsFromObiekty(raw.organ_reprezentacji, 'zarzad'),
    prokurenci: extractPersonsFromObiekty(raw.prokurenci, 'prokura'),
    wspolnicy: extractWspolnicy(raw.dane_wspolnikow),
    raw,
  }
}
