// lib/integrations/krs-rejestr.ts
// KRS Rejestr.io API client — verify polskich firm by NIP / search by
// name. Schema dokładna do potwierdzenia przy pierwszym requeście —
// poniższe field mappings są permissive (sprawdzają oba: snake_case
// jak w Polish API i camelCase jak w niektórych REST wrapperach).
// Jeśli pierwszy lookup zwróci undefined dla pól — zaloguj raw
// response i adapt mapowanie tutaj.

const KRS_BASE = 'https://rejestr.io/api/v2'

export interface KrsAddress {
  street?: string
  city?: string
  postalCode?: string
  region?: string
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

const adaptEntity = (raw: unknown): KrsCompanyData | null => {
  if (!isObject(raw)) return null

  const addrRaw =
    isObject(raw.adres)
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

  const pkdRaw = raw.pkd ?? raw.industries
  const industries: string[] = Array.isArray(pkdRaw)
    ? pkdRaw
        .map((p) =>
          isObject(p)
            ? pickString(p, 'kod', 'code')
            : typeof p === 'string'
              ? p
              : undefined,
        )
        .filter((s): s is string => !!s)
    : []

  const statusRaw = pickString(raw, 'status')
  let status: KrsCompanyData['status']
  if (statusRaw) {
    const upper = statusRaw.toUpperCase()
    if (upper.includes('AKTYW')) status = 'active'
    else if (upper.includes('LIKWID')) status = 'liquidation'
    else status = 'inactive'
  }

  const name = pickString(raw, 'nazwa', 'name')
  if (!name) return null

  return {
    name,
    nip: pickString(raw, 'nip'),
    krs: pickString(raw, 'krs'),
    regon: pickString(raw, 'regon'),
    legalForm: pickString(raw, 'forma_prawna', 'formaPrawna', 'legalForm'),
    status,
    address,
    industries,
    capital:
      typeof raw.kapital === 'number'
        ? raw.kapital
        : typeof raw.capital === 'number'
          ? raw.capital
          : null,
    registrationDate: pickString(
      raw,
      'data_rejestracji',
      'dataRejestracji',
      'registrationDate',
    ),
    rawData: raw,
  }
}

const extractResults = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data
  if (isObject(data)) {
    if (Array.isArray(data.results)) return data.results
    if (Array.isArray(data.podmioty)) return data.podmioty
    if (Array.isArray(data.items)) return data.items
    if (data.id || data.nazwa || data.name) return [data]
  }
  return []
}

export async function lookupKrsByNip(
  apiToken: string,
  nip: string,
): Promise<KrsCompanyData | null> {
  const cleanNip = nip.replace(/\D/g, '')
  if (cleanNip.length !== 10) {
    throw new Error(`Invalid NIP: ${nip} (must be 10 digits)`)
  }

  try {
    const response = await fetch(
      `${KRS_BASE}/podmioty?nip=${cleanNip}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (response.status === 404) return null
    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(
        `KRS Rejestr ${response.status}: ${errText.slice(0, 200)}`,
      )
    }

    const data = (await response.json()) as unknown
    const results = extractResults(data)
    if (results.length === 0) return null
    return adaptEntity(results[0])
  } catch (err) {
    // Lookup failures są oczekiwane (NIP not in registry, network) —
    // log + return null, callsite decyduje czy to fatal.
    console.error('[krs-rejestr] lookupKrsByNip failed', {
      nip: cleanNip,
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export async function lookupKrsByName(
  apiToken: string,
  name: string,
  limit = 5,
): Promise<KrsCompanyData[]> {
  try {
    const response = await fetch(
      `${KRS_BASE}/podmioty?nazwa=${encodeURIComponent(name)}&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      },
    )

    if (!response.ok) return []
    const data = (await response.json()) as unknown
    const results = extractResults(data).slice(0, limit)
    return results
      .map(adaptEntity)
      .filter((e): e is KrsCompanyData => e != null)
  } catch (err) {
    console.error('[krs-rejestr] lookupKrsByName failed', {
      name,
      message: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
