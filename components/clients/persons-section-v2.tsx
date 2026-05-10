// components/clients/persons-section-v2.tsx
// Sprint S2B Phase 2E — Osoby section z real names z source='rejestrio_v2'
// + CRBR beneficjenci sub-section + person network counter.
// Sprint S6B-UI-A (11.05.2026) — додано 🇺🇦 flag коли CRBR beneficjent
// має UA citizenship або residency. Visibility для UA-власники edge.

const UA_CITIZENSHIP_RE = /\b(UA|UKR|UKRAIN[A-Z]+)\b/i

function isUaBeneficiary(b: { kraj_rezydencji: string | null; obywatelstwa: string[] }): boolean {
  if (b.kraj_rezydencji && UA_CITIZENSHIP_RE.test(b.kraj_rezydencji)) return true
  return b.obywatelstwa.some((c) => UA_CITIZENSHIP_RE.test(c))
}

interface PersonLink {
  imie: string
  nazwisko: string
  rola: string
  jest_decyzyjny: boolean
  source: string
  rejestrio_person_id: number | null
  network_count: number
}

interface CrbrEntry {
  imie: string | null
  nazwisko: string | null
  kraj_rezydencji: string | null
  obywatelstwa: string[]
}

interface Props {
  persons: PersonLink[]
  crbr: CrbrEntry[]
}

function initials(imie: string, nazwisko: string): string {
  const i = (imie ?? '').slice(0, 1).toUpperCase()
  const n = (nazwisko ?? '').slice(0, 1).toUpperCase()
  return (i + n) || '??'
}

export function PersonsSectionV2({ persons, crbr }: Props) {
  if (persons.length === 0 && crbr.length === 0) {
    return (
      <div className="text-sm text-[#555]">
        Brak osób w bazie. Uruchom Intelligence Lookup żeby pobrać zarząd z KRS.
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {persons.length > 0 && (
        <div>
          <h3 className="mb-2 text-[10px] uppercase tracking-wider text-[#888]">Zarząd / wspólnicy</h3>
          <ul className="divide-y divide-[#F0EDE5]">
            {persons.map((p, i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#4F46E5]/10 text-[12px] font-medium text-[#4F46E5]">
                  {initials(p.imie, p.nazwisko)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {p.imie} {p.nazwisko}
                    </span>
                    {p.jest_decyzyjny && (
                      <span className="rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-medium text-[#92400E]">
                        ⭐ decyzyjny
                      </span>
                    )}
                    {p.source === 'rejestrio_v2' && (
                      <span className="rounded bg-[#DCFCE7] px-1.5 py-0.5 text-[10px] font-medium text-[#15803D]">
                        rejestr.io
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[#888]">{p.rola}</div>
                </div>
                {p.network_count > 0 && (
                  <span className="text-[12px] text-[#4F46E5]">
                    {p.network_count} inne firmy →
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {crbr.length > 0 && (
        <div>
          <h3 className="mb-2 text-[10px] uppercase tracking-wider text-[#888]">
            Beneficjenci rzeczywiści (CRBR)
          </h3>
          <ul className="divide-y divide-[#F0EDE5]">
            {crbr.map((b, i) => {
              const isUa = isUaBeneficiary(b)
              return (
                <li key={i} className="flex items-center gap-3 py-2">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F59E0B]/10 text-[12px] font-medium text-[#92400E]">
                    {initials(b.imie ?? '', b.nazwisko ?? '')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium flex items-center gap-1.5">
                      {isUa && <span aria-label="Ukrainian beneficiary">🇺🇦</span>}
                      <span>
                        {b.imie} {b.nazwisko}
                      </span>
                    </div>
                    <div className="text-[12px] text-[#888]">
                      {b.kraj_rezydencji && `Rezydencja: ${b.kraj_rezydencji}`}
                      {b.obywatelstwa.length > 0 && ` · Obywatelstwo: ${b.obywatelstwa.join(', ')}`}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
