// components/clients/metric-strip.tsx
// Sprint S2B Phase 2C — 4-col metric strip Score/Obroty/Pracownicy/Oddziały.

interface Props {
  /** Fix 12.06 — Dopasowanie Sztab = buyer_strength_for_chm (spójne z listami). */
  buyerStrength: number | null
  /** TOP dopasowanie produktowe (algo_score najlepszego matcha) — osobna metryka. */
  topMatchScore: number | null
  /** Latest year revenue from financial_statements.przychody_netto */
  latestRevenuePln: number | null
  /** Optional YoY % growth on revenue (computed by caller). */
  revenueYoyPct: number | null
  employeesCount: number | null
  branchOfficesCount: number | null
}

function formatPln(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} mln`
  if (v >= 1_000) return `${Math.round(v / 1_000)} tys.`
  return Math.round(v).toString()
}

export function MetricStrip({
  buyerStrength,
  topMatchScore,
  latestRevenuePln,
  revenueYoyPct,
  employeesCount,
  branchOfficesCount,
}: Props) {
  const score = buyerStrength ?? 0
  const scoreColor =
    score >= 70 ? 'bg-[#00A656]' : score >= 40 ? 'bg-[#F59E0B]' : 'bg-[#888]'
  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
      {/* Score */}
      <div className="rounded-lg border border-[#E5E1D8] bg-white px-5 py-4">
        <div className="text-[10px] uppercase tracking-wider text-[#888]">Dopasowanie Sztab</div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-[28px] font-medium leading-none">
            {buyerStrength !== null ? buyerStrength : '—'}
          </span>
          <span className="text-[14px] text-[#888]">/ 100</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-[#F0EDE5]">
          <div className={`h-full ${scoreColor}`} style={{ width: `${score}%` }} />
        </div>
        <div className="mt-2 text-[11px] text-[#888]">
          TOP dopasowanie produktowe:{' '}
          <span className="font-medium text-[#555]">
            {topMatchScore !== null ? `${topMatchScore}/100` : '—'}
          </span>
        </div>
      </div>
      {/* Obroty */}
      <div className="rounded-lg border border-[#E5E1D8] bg-white px-5 py-4">
        <div className="text-[10px] uppercase tracking-wider text-[#888]">Obroty (rok obrotowy)</div>
        <div className="mt-1 text-[18px] font-medium">
          {formatPln(latestRevenuePln)}
          {latestRevenuePln !== null && <span className="ml-1 text-[12px] text-[#888]">PLN</span>}
        </div>
        {revenueYoyPct !== null && (
          <div
            className={`mt-1 text-[12px] ${
              revenueYoyPct >= 0 ? 'text-[#00A656]' : 'text-[#DC2626]'
            }`}
          >
            {revenueYoyPct >= 0 ? '↑' : '↓'} {Math.abs(revenueYoyPct).toFixed(1)}% YoY
          </div>
        )}
      </div>
      {/* Pracownicy */}
      <div className="rounded-lg border border-[#E5E1D8] bg-white px-5 py-4">
        <div className="text-[10px] uppercase tracking-wider text-[#888]">Pracownicy</div>
        <div className="mt-1 text-[18px] font-medium">
          {employeesCount !== null ? employeesCount : '—'}
        </div>
      </div>
      {/* Oddziały */}
      <div className="rounded-lg border border-[#E5E1D8] bg-white px-5 py-4">
        <div className="text-[10px] uppercase tracking-wider text-[#888]">Oddziały</div>
        <div className="mt-1 text-[18px] font-medium">
          {branchOfficesCount !== null ? branchOfficesCount : '—'}
        </div>
      </div>
    </div>
  )
}
