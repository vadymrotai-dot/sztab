// lib/integrations/krs-rejestr.ts
// KRS Rejestr.io API client. Phase 2 / Hotfix 5:
//   - URL pattern: /api/v2/org/nip{nip} ("nip" prefix glued do
//     10-cyfrowego numeru, NIE query string). Hotfix 3 używał
//     /krs/podstawowe/... który nie istnieje — rejestr.io zwracał 400.
//   - Auth header: "Authorization: <token>" (BEZ "Bearer " prefix —
//     rejestr.io używa raw token jako wartość headera)
//   - lookupKrsByName: /api/v2/krs/wyszukiwarka?nazwa={encoded}
//
// adaptKrsResponse mapuje permissive — endpoint /org/ zwraca pola pod
// 'nazwy' (object z pelna/skrocona) i 'siedziba' (address); fallback
// na 'nazwa'/'adres' z poprzednich wariantów. KRS pobierany z 'krs'
// lub fallback na 'id' (integer padded do 10 cyfr).

const KRS_BASE = 'https://rejestr.io/api/v2'

export interface KrsAddress {
  street?: string
  city?: string
  postalCode?: string
  region?: string
}

export interface KrsHeadPerson {
  id?: string | number
  name?: string
  function?: string
}

export interface KrsContactData {
  emails?: string[]
  website?: string
}

export interface KrsCompanyData {
  name: string
  nip?: string
  krs?: string
  regon?: string
  legalForm?: string
  status?: 'active' | 'inactive' | 'liquidation'
  address?: KrsAddress
  industries?: string[]
  capital?: number | null
  registrationDate?: string
  headPerson?: KrsHeadPerson | null
  contactData?: KrsContactData | null
  rawData?: unknown
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const pickString = (
  obj: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined => {
  if (!obj) return undefined
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

const pickNumber = (
  obj: Record<string, unknown> | undefined,
  ...keys: string[]
): number | null => {
  if (!obj) return null
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
      const n = Number.parseFloat(v.replace(/\s/g, '').replace(',', '.'))
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function adaptKrsResponse(raw: unknown): KrsCompanyData | null {
  if (!isObject(raw)) return null

  // Endpoint /org/{id} zwraca name pod 'nazwy' object z wariantami
  // (pelna/skrocona). Stary endpoint /podmioty zwracał 'nazwa' jako
  // string. Próbujemy obu (defensive).
  let name: string | undefined
  if (isObject(raw.nazwy)) {
    name =
      pickString(raw.nazwy, 'pelna', 'skrocona', 'pełna') ?? undefined
  }
  if (!name) name = pickString(raw, 'nazwa', 'name')
  if (!name) return null

  // Address: rejestr.io endpoint /org/ zwraca pod 'siedziba',
  // /podmioty zwracał pod 'adres'. /api/v2/krs/podstawowe... zwracał
  // 'address' (EN). Wszystkie trzy pomija obsługujemy.
  const addrRaw =
    isObject(raw.siedziba)
      ? raw.siedziba
      : isObject(raw.adres)
        ? raw.adres
        : isObject(raw.address)
          ? raw.address
          : undefined

  const address: KrsAddress | undefined = addrRaw
    ? {
        street: pickString(addrRaw, 'ulica', 'street'),
        city: pickString(addrRaw, 'miasto', 'miejscowosc', 'city'),
        postalCode: pickString(
          addrRaw,
          'kod_pocztowy',
          'kodPocztowy',
          'postalCode',
        ),
        region: pickString(addrRaw, 'wojewodztwo', 'region'),
      }
    : undefined

  // Status: aktywne firmy nie mają data_wykreslenia. Jeśli jest,
  // firma została wykreślona z KRS → inactive. Likwidacja oznaczona
  // może być flagą w 'status' (rzadkie).
  const wykreslenieRaw = pickString(
    raw,
    'rejestr_przedsiebiorcow_data_wykreslenia',
    'data_wykreslenia',
  )
  const statusRaw = pickString(raw, 'status')
  let status: KrsCompanyData['status']
  if (wykreslenieRaw) {
    status = 'inactive'
  } else if (statusRaw && /likwid/i.test(statusRaw)) {
    status = 'liquidation'
  } else {
    status = 'active'
  }

  // PKD: rejestr.io zwraca 'pkd_glowny' jako string (kod). Czasem
  // dodatkowo 'pkd' tablica.
  const industries: string[] = []
  const pkdGlowny = pickString(raw, 'pkd_glowny', 'pkdGlowny')
  if (pkdGlowny) industries.push(pkdGlowny)
  if (Array.isArray(raw.pkd)) {
    for (const p of raw.pkd) {
      if (typeof p === 'string') industries.push(p)
      else if (isObject(p)) {
        const code = pickString(p, 'kod', 'code')
        if (code && !industries.includes(code)) industries.push(code)
      }
    }
  }

  // Head person + contact data — opcjonalne, bonus dla downstream UI.
  let headPerson: KrsHeadPerson | null = null
  if (isObject(raw.osoba_glowna)) {
    const op = raw.osoba_glowna
    const personName = `${pickString(op, 'imie') ?? ''} ${pickString(op, 'nazwisko') ?? ''}`.trim()
    headPerson = {
      id: (op.id as string | number | undefined) ?? undefined,
      name: personName || undefined,
      function: pickString(op, 'funkcja', 'function'),
    }
  }

  let contactData: KrsContactData | null = null
  if (isObject(raw.dane_kontaktowe)) {
    const dk = raw.dane_kontaktowe
    contactData = {
      emails: Array.isArray(dk.emails)
        ? (dk.emails.filter((e) => typeof e === 'string') as string[])
        : undefined,
      website: pickString(dk, 'strona_internetowa', 'website'),
    }
  }

  // KRS fallback: endpoint /org/ zwraca KRS jako 'id' (integer) —
  // padded do 10 cyfr to standardowy format. /podmioty zwracał już
  // pole 'krs'.
  let krsValue = pickString(raw, 'krs')
  if (!krsValue && (typeof raw.id === 'number' || typeof raw.id === 'string')) {
    krsValue = String(raw.id).padStart(10, '0')
  }

  return {
    name,
    nip: pickString(raw, 'nip'),
    krs: krsValue,
    regon: pickString(raw, 'regon'),
    legalForm: pickString(raw, 'forma_prawna', 'formaPrawna', 'legalForm'),
    status,
    address,
    industries,
    capital: pickNumber(raw, 'kapital_zakladowy', 'kapital', 'capital'),
    registrationDate: pickString(
      raw,
      'rejestr_przedsiebiorcow_data_wpisu',
      'wpis_pierwszy_data',
      'data_rejestracji',
      'registrationDate',
    ),
    headPerson,
    contactData,
    rawData: raw,
  }
}

const extractResults = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data
  if (isObject(data)) {
    if (Array.isArray(data.results)) return data.results
    if (Array.isArray(data.podmioty)) return data.podmioty
    if (Array.isArray(data.organizacje)) return data.organizacje
    if (Array.isArray(data.items)) return data.items
    if (data.nazwa || data.name || data.nip || data.krs) return [data]
  }
  return []
}

let firstSuccessLogged = false

export async function lookupKrsByNip(
  apiToken: string,
  nip: string,
): Promise<KrsCompanyData | null> {
  const cleanNip = nip.replace(/\D/g, '')
  if (cleanNip.length !== 10) {
    console.error(`[krs-rejestr] Invalid NIP format: ${nip}`)
    return null
  }

  // Endpoint /api/v2/org/{id} — gdzie {id} to NIP poprzedzony "nip"
  // (np. nip1234567890) lub raw KRS number. Hotfix 3 używał
  // /krs/podstawowe/nip... — to był nieprawidłowy endpoint, rejestr.io
  // zwracał 400 "Podana ścieżka żądania API nie odpowiada żadnemu
  // zdefiniowanemu endpointowi API". Poprawny endpoint /org/nip{nip}
  // potwierdzony z rejestr.io/api/info/podstawowe-dane-organizacji.
  const url = `${KRS_BASE}/org/nip${cleanNip}`

  try {
    const response = await fetch(url, {
      headers: {
        // NIE "Bearer " — rejestr.io używa raw token jako wartość.
        Authorization: apiToken,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (response.status === 404) {
      // NIP nie ma w rejestrze KRS — typowe dla małych firm /
      // jednoosobowych działalności (CEIDG, nie KRS). Graceful null.
      return null
    }

    if (response.status === 401 || response.status === 403) {
      console.error(
        `[krs-rejestr] Auth failed ${response.status} — sprawdź klucz w /settings`,
      )
      throw new Error('KRS API auth failed — sprawdź klucz w /settings')
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error(
        `[krs-rejestr] Unexpected ${response.status} for nip${cleanNip}:`,
        errorText.slice(0, 300),
      )
      throw new Error(
        `KRS Rejestr ${response.status}: ${errorText.slice(0, 200)}`,
      )
    }

    const data = (await response.json()) as unknown

    // Diagnostic: log structure of pierwszego successful response. Po
    // pierwszym deploy + run mogę zweryfikować że adaptKrsResponse
    // mapuje wszystkie pola. Logujemy raz (cold-start scope OK —
    // odpalamy więcej runów w pierwszej fali debugowania).
    if (!firstSuccessLogged && isObject(data)) {
      firstSuccessLogged = true
      console.log(
        '[krs-rejestr] first success — top-level keys:',
        Object.keys(data).slice(0, 20),
      )
    }

    return adaptKrsResponse(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[krs-rejestr] lookupKrsByNip failed', {
      nip: cleanNip,
      message: message.slice(0, 200),
    })
    return null
  }
}

export async function lookupKrsByName(
  apiToken: string,
  name: string,
  limit = 5,
): Promise<KrsCompanyData[]> {
  const url = `${KRS_BASE}/krs/wyszukiwarka?nazwa=${encodeURIComponent(name)}&limit=${limit}`
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: apiToken,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) return []
    const data = (await response.json()) as unknown
    const results = extractResults(data).slice(0, limit)
    return results
      .map(adaptKrsResponse)
      .filter((e): e is KrsCompanyData => e != null)
  } catch (err) {
    console.error('[krs-rejestr] lookupKrsByName failed', {
      name,
      message: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
