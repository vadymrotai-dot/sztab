// components/clients/signals-section.tsx
// Sprint S2B Phase 2E — Sygnały: last_filing freshness + red flags + BZP.

interface Props {
  lastFilingDate: string | null
  bankruptcyFlag: boolean
  liquidationFlag: boolean
  restructuringFlag: boolean
  suspendedAt: string | null
  bzpCount: number
}

function freshnessBadge(date: string | null): { label: string; cls: string } {
  if (!date) {
    return { label: 'Brak ostatniego sprawozdania', cls: 'bg-[#F5F5F5] text-[#888]' }
  }
  const days = (Date.now() - new Date(date).getTime()) / 86_400_000
  if (days < 365) return { label: `Świeże (${date})`, cls: 'bg-[#DCFCE7] text-[#15803D]' }
  if (days < 730) return { label: `Stare (${date})`, cls: 'bg-[#FEF3C7] text-[#92400E]' }
  return { label: `Nieaktualne (${date})`, cls: 'bg-[#FEE2E2] text-[#991B1B]' }
}

export function SignalsSection({
  lastFilingDate,
  bankruptcyFlag,
  liquidationFlag,
  restructuringFlag,
  suspendedAt,
  bzpCount,
}: Props) {
  const filing = freshnessBadge(lastFilingDate)
  const flags: { label: string; show: boolean }[] = [
    { label: '🔴 Upadłość', show: bankruptcyFlag },
    { label: '🔴 Likwidacja', show: liquidationFlag },
    { label: '🟠 Restrukturyzacja', show: restructuringFlag },
    { label: '🟠 Zawieszona działalność', show: suspendedAt !== null },
  ]
  const hasRedFlags = flags.some((f) => f.show)
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[#888]">Sprawozdanie KRS:</span>
        <span className={`rounded px-2 py-0.5 text-[12px] font-medium ${filing.cls}`}>
          {filing.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[#888]">Status prawny:</span>
        {hasRedFlags ? (
          flags
            .filter((f) => f.show)
            .map((f) => (
              <span
                key={f.label}
                className="rounded bg-[#FEE2E2] px-2 py-0.5 text-[12px] font-medium text-[#991B1B]"
              >
                {f.label}
              </span>
            ))
        ) : (
          <span className="rounded bg-[#DCFCE7] px-2 py-0.5 text-[12px] font-medium text-[#15803D]">
            ✓ Aktywna, brak red flags
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[#888]">Przetargi BZP:</span>
        <span className="rounded bg-[#F5F5F5] px-2 py-0.5 text-[12px] text-[#555]">
          {bzpCount > 0
            ? `${bzpCount} wygranych`
            : 'Brak wygranych — typowe dla małych firm detalicznych'}
        </span>
      </div>
    </div>
  )
}
