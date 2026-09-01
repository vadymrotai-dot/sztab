// lib/nip/mf-lookup.ts — wspólny lookup NIP przez rejestr Ministerstwa Finansów
// (wl-api.mf.gov.pl). Używany przez /api/nip-lookup ORAZ akcję portalu
// createClientFromNipAndApprove — jedna implementacja, zero duplikacji.

import 'server-only'

export type MfClientData = {
  name: string
  nip: string
  statusVat: string
  regon: string
  krs: string
  address: string
  city: string
  registrationDate: string
  accountNumbers: string[]
}

export type MfLookupResult =
  | { ok: true; data: MfClientData }
  | { ok: false; error: string; status: number }

interface MFSubject {
  name?: string
  nip?: string
  statusVat?: string
  regon?: string
  krs?: string
  residenceAddress?: string
  workingAddress?: string
  registrationLegalDate?: string
  accountNumbers?: string[]
}

export async function lookupNipMF(nipRaw: string): Promise<MfLookupResult> {
  const nip = String(nipRaw || '').replace(/\D/g, '')
  if (nip.length !== 10) {
    return { ok: false, error: 'NIP musi składać się z 10 cyfr', status: 400 }
  }

  const today = new Date().toISOString().slice(0, 10)
  const url = `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${today}`

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Błąd połączenia z MF', status: 502 }
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `MF API zwróciło kod ${res.status}`,
      status: res.status === 404 ? 404 : 502,
    }
  }

  const data = (await res.json()) as { result?: { subject?: MFSubject } }
  const subject = data?.result?.subject
  if (!subject) {
    return { ok: false, error: 'Nie znaleziono firmy o takim NIP', status: 404 }
  }

  const addr = subject.workingAddress || subject.residenceAddress || ''
  const cityMatch = addr.match(/\d{2}-\d{3}\s+([A-ZŁŚĆŹŻ][\wŁŚĆŹŻĄĘÓŃłśćźżąęóń-]+)/i)
  const city = cityMatch?.[1] || ''

  return {
    ok: true,
    data: {
      name: subject.name || '',
      nip: subject.nip || nip,
      statusVat: subject.statusVat || '',
      regon: subject.regon || '',
      krs: subject.krs || '',
      address: addr,
      city,
      registrationDate: subject.registrationLegalDate || '',
      accountNumbers: subject.accountNumbers || [],
    },
  }
}
