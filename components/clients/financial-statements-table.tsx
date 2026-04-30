// components/clients/financial-statements-table.tsx
// Sprint S2B Phase 4A — render financial_statements rows (S1+ data).

interface FinancialRow {
  okres_data_koniec: string
  przychody_netto: number | string | null
  zysk_netto: number | string | null
  aktywa_razem: number | string | null
  liczba_pracownikow: number | null
}

interface Props {
  rows: FinancialRow[]
}

function n(v: number | string | null): number | null {
  if (v === null || v === undefined) return null
  const x = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(x) ? x : null
}

function formatPln(v: number | null): string {
  if (v === null) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} mln`
  if (v >= 1_000) return `${Math.round(v / 1_000)} tys.`
  return Math.round(v).toString()
}

function yearOf(s: string): number {
  return Number(s.slice(0, 4))
}

function deltaPct(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev === 0) return null
  return ((curr - prev) / prev) * 100
}

export function FinancialStatementsTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="text-sm text-[#555]">
        Brak sprawozdań finansowych w rejestrze.
      </div>
    )
  }
  // Sort newest first
  const sorted = [...rows].sort((a, b) => yearOf(b.okres_data_koniec) - yearOf(a.okres_data_koniec))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-[#F0EDE5]">
          <tr className="text-left text-[10px] uppercase tracking-wider text-[#888]">
            <th className="py-2 pr-3">Rok</th>
            <th className="py-2 pr-3">Przychody netto</th>
            <th className="py-2 pr-3">Zysk netto</th>
            <th className="py-2 pr-3">Aktywa razem</th>
            <th className="py-2 pr-3">Δ przychody YoY</th>
            <th className="py-2 pr-3">Pracownicy</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const isLatest = i === 0
            const next = sorted[i + 1]
            const yoy = deltaPct(n(r.przychody_netto), n(next?.przychody_netto ?? null))
            return (
              <tr
                key={r.okres_data_koniec}
                className={`border-b border-[#F0EDE5] ${isLatest ? '' : 'text-[#888]'}`}
              >
                <td className="py-2 pr-3 font-medium">{yearOf(r.okres_data_koniec)}</td>
                <td className="py-2 pr-3 font-mono">{formatPln(n(r.przychody_netto))}</td>
                <td className="py-2 pr-3 font-mono">{formatPln(n(r.zysk_netto))}</td>
                <td className="py-2 pr-3 font-mono">{formatPln(n(r.aktywa_razem))}</td>
                <td className="py-2 pr-3">
                  {yoy === null ? (
                    <span className="text-[#888]">—</span>
                  ) : (
                    <span className={yoy >= 0 ? 'text-[#00A656]' : 'text-[#DC2626]'}>
                      {yoy >= 0 ? '↑' : '↓'} {Math.abs(yoy).toFixed(1)}%
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">{r.liczba_pracownikow ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
