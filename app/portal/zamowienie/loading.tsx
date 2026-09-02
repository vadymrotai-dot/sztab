// app/portal/zamowienie/loading.tsx — Suspense-fallback dla formularza zamówienia.
// Kontur: pasek stepper (3 kółka) + karta dostawy + lista wierszy produktów
// (nazwa po lewej, stepper ilości po prawej). Prezentacyjny, zero danych.

export default function ZamowienieLoading() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl animate-pulse bg-white shadow-sm">
      <div>
        {/* Stepper */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-6 pt-4 pb-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-1 items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-slate-200" />
              <div className="h-3 w-24 rounded bg-slate-200" />
              {i < 2 && <div className="h-px flex-1 bg-slate-200" />}
            </div>
          ))}
        </div>

        {/* Karta dostawy */}
        <div className="px-6 py-5">
          <div className="mb-4 h-4 w-40 rounded bg-slate-200" />
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="h-10 rounded-md bg-slate-100" />
            <div className="h-10 rounded-md bg-slate-100" />
          </div>

          {/* Wiersze produktów */}
          <div className="mb-3 h-3 w-32 rounded bg-slate-200" />
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-3"
              >
                <div className="space-y-2">
                  <div className="h-4 w-48 rounded bg-slate-200" />
                  <div className="h-3 w-24 rounded bg-slate-100" />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-[38px] w-[38px] rounded-lg bg-slate-200" />
                  <div className="h-[38px] w-[58px] rounded-lg bg-slate-100" />
                  <div className="h-[38px] w-[38px] rounded-lg bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
