// components/clients/supplier-matrix.tsx
// Sprint S4 Phase 1E — multi-supplier buyer-strength matrix.
// Renders 5 rows (Czudowa Marka + 4 future suppliers). Only ChM has
// a real value (from business_profile.buyer_strength_for_chm). Others
// render "—" until Sprint M wires per-supplier scoring.

interface SupplierRow {
  name: string
  /** 0-100, або null gdy не obliczono. */
  strength: number | null
  /** Optional SKU count для tego dostawcy. */
  skuCount?: number | null
}

interface Props {
  rows: SupplierRow[]
  clientId: string
}

function bandLabel(s: number | null): string {
  if (s === null) return 'Brak danych'
  if (s >= 70) return 'Buyer strength'
  if (s >= 50) return 'Neutral'
  if (s >= 30) return 'Weak match'
  return 'No fit'
}

function bandColor(s: number | null): string {
  if (s === null) return 'bg-[#E5E1D8]'
  if (s >= 70) return 'bg-[#00A656]'
  if (s >= 50) return 'bg-[#888]'
  if (s >= 30) return 'bg-[#F59E0B]'
  return 'bg-[#DC2626]'
}

function Segments({ score }: { score: number | null }) {
  // 5 segments. Filled count proporcjonalny до score / 100.
  const filled = score === null ? 0 : Math.max(0, Math.min(5, Math.round(score / 20)))
  const color = bandColor(score)
  return (
    <div className="flex gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`h-2 w-6 rounded-sm ${i < filled ? color : 'bg-[#F0EDE5]'}`}
        />
      ))}
    </div>
  )
}

export function SupplierMatrix({ rows, clientId }: Props) {
  return (
    <div className="rounded-md border border-[#E5E1D8] bg-white">
      <div className="border-b border-[#F0EDE5] px-4 py-2 text-[10px] uppercase tracking-wider text-[#888]">
        Buyer strength per dostawca
      </div>
      <div className="divide-y divide-[#F0EDE5]">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-4 px-4 py-2.5">
            <div className="w-32 flex-shrink-0 text-[13px] font-medium">
              {row.name}
            </div>
            <Segments score={row.strength} />
            <div className="flex-1 text-[12px] text-[#555]">
              {bandLabel(row.strength)}
              {row.strength !== null && (
                <span className="ml-2 text-[#888]">{row.strength}/100</span>
              )}
            </div>
            {typeof row.skuCount === 'number' && row.skuCount > 0 ? (
              <a
                href={`/clients/${clientId}#dopasowania`}
                className="whitespace-nowrap text-[12px] text-[#4F46E5] hover:underline"
              >
                {row.skuCount} SKU →
              </a>
            ) : (
              <span className="w-16" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
