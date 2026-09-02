// app/portal/historia/loading.tsx — Suspense-fallback dla historii zamówień.
// Kontur: tytuł + 3 karty zamówień (nagłówek: numer/badge/data/suma + wiersze
// pozycji). Ten sam layout co historia/page.tsx. Prezentacyjny, zero danych.

export default function HistoriaLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 animate-pulse">
      <div className="mb-4 h-6 w-56 rounded bg-slate-200" />

      <div className="space-y-4">
        {[0, 1, 2].map((c) => (
          <div key={c} className="rounded-lg border border-[#E5E1D8] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="h-4 w-28 rounded bg-slate-200" />
                <div className="h-4 w-20 rounded bg-slate-200" />
                <div className="h-3 w-16 rounded bg-slate-100" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-4 w-16 rounded bg-slate-200" />
                <div className="h-6 w-28 rounded-md bg-slate-200" />
              </div>
            </div>
            <div className="divide-y divide-[#F0F0F0]">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center justify-between py-1.5">
                  <div className="h-3 w-40 rounded bg-slate-100" />
                  <div className="h-3 w-32 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
