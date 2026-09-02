// app/portal/loading.tsx — Suspense-fallback dla Pulpitu (struktura A).
// WYŁĄCZNIE prezentacyjny szkielet: kontur 3 kart KPI + akcje + lista ostatnich.
// Zero odczytu danych, zero logiki. Nav (layout) zostaje widoczny nad tym.

const Bar = ({ w, h = 'h-4' }: { w: string; h?: string }) => (
  <div className={`${w} ${h} rounded bg-slate-200`} />
)

export default function PulpitLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 animate-pulse">
      <div className="mb-4 h-6 w-48 rounded bg-slate-200" />

      {/* 3 karty KPI — ten sam grid co PulpitDashboard */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg bg-[#F5F5F0] p-4">
            <Bar w="w-20" h="h-3" />
            <div className="mt-3 h-7 w-12 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Szybkie akcje */}
      <div className="mb-6 flex gap-2">
        <div className="h-9 w-36 rounded-md bg-slate-200" />
        <div className="h-9 w-36 rounded-md bg-slate-200" />
      </div>

      {/* Ostatnie zamówienia */}
      <Bar w="w-40" h="h-3" />
      <div className="mt-2 rounded-lg border border-[#E5E1D8] bg-white">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`flex items-center justify-between px-4 py-3 ${
              i < 3 ? 'border-b border-[#F0F0F0]' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <Bar w="w-28" />
              <Bar w="w-16" h="h-3" />
            </div>
            <div className="flex items-center gap-3">
              <Bar w="w-16" h="h-5" />
              <Bar w="w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
