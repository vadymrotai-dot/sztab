// components/portal/pulpit-dashboard.tsx — Portal klienta, struktura A: Pulpit.
// Server component (linki, bez interakcji). Karty: W realizacji / Ostatnie /
// Zamówień łącznie. Szybkie akcje + ostatnie zamówienia. Empty-state dla 0.

import Link from 'next/link'

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  submitted: { label: 'Złożone', cls: 'bg-blue-100 text-blue-800' },
  confirmed: { label: 'Potwierdzone', cls: 'bg-indigo-100 text-indigo-800' },
  invoiced: { label: 'Zafakturowane', cls: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Anulowane', cls: 'bg-slate-100 text-slate-500' },
}

function pln(n: number | null | undefined): string {
  return `${Number(n ?? 0).toFixed(2)} zł`
}
function dt(s: string): string {
  try {
    return new Date(s).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })
  } catch {
    return s
  }
}

interface RecentOrder {
  id: string
  order_number: string
  status: string
  total_brutto: number | null
  submitted_at: string | null
  created_at: string
}

export function PulpitDashboard({
  firma,
  hasUnfinishedDraft,
  inRealization,
  totalCount,
  last,
  recent,
}: {
  firma: string
  hasUnfinishedDraft?: boolean
  inRealization: number
  totalCount: number
  last: { id: string; total_brutto: number | null; date: string } | null
  recent: RecentOrder[]
}) {
  const firstWord = firma.split(' ')[0] || 'Kliencie'

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold text-slate-800">
        Dzień dobry, {firstWord}
      </h1>

      {hasUnfinishedDraft && (
        <Link
          href="/portal/zamowienie"
          className="mb-4 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 hover:bg-amber-100"
        >
          <span className="text-sm font-medium text-amber-900">
            Masz niedokończone zamówienie — wróć i dokończ.
          </span>
          <span className="text-sm font-medium text-amber-900">Wznów →</span>
        </Link>
      )}

      {totalCount === 0 ? (
        <div className="rounded-xl border border-[#E5E1D8] bg-white p-8 text-center">
          <p className="mb-1 text-base font-medium text-slate-800">
            Nie masz jeszcze żadnych zamówień
          </p>
          <p className="mb-5 text-sm text-slate-500">
            Złóż pierwsze zamówienie — Twoje ceny są już przygotowane.
          </p>
          <Link
            href="/portal/zamowienie"
            className="inline-block rounded-md px-5 py-2.5 text-sm font-medium text-white"
            style={{ backgroundColor: '#1F3A5F' }}
          >
            Złóż pierwsze zamówienie
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-[#F5F5F0] p-4">
              <div className="text-[13px] text-slate-500">W realizacji</div>
              <div className="text-2xl font-medium">{inRealization}</div>
            </div>
            <div className="rounded-lg bg-[#F5F5F0] p-4">
              <div className="text-[13px] text-slate-500">Ostatnie zamówienie</div>
              <div className="text-2xl font-medium">
                {last ? pln(last.total_brutto) : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-[#F5F5F0] p-4">
              <div className="text-[13px] text-slate-500">Zamówień łącznie</div>
              <div className="text-2xl font-medium">{totalCount}</div>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {last && (
              <Link
                href={`/portal/zamowienie?reorder=${last.id}`}
                className="rounded-md px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: '#1F3A5F' }}
              >
                Powtórz ostatnie
              </Link>
            )}
            <Link
              href="/portal/zamowienie"
              className="rounded-md border border-[#E5E1D8] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Nowe zamówienie
            </Link>
          </div>

          <div className="mb-2 text-[13px] font-medium text-slate-500">
            Ostatnie zamówienia
          </div>
          <div className="rounded-lg border border-[#E5E1D8] bg-white">
            {recent.map((o, i) => {
              const st = STATUS_LABEL[o.status] ?? {
                label: o.status,
                cls: 'bg-slate-100 text-slate-600',
              }
              return (
                <div
                  key={o.id}
                  className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${
                    i < recent.length - 1 ? 'border-b border-[#F0F0F0]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium">{o.order_number}</span>
                    <span className="text-xs text-slate-400">
                      {dt(o.submitted_at ?? o.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                      {st.label}
                    </span>
                    <span className="text-sm font-semibold">{pln(o.total_brutto)}</span>
                    {o.status !== 'cancelled' && (
                      <Link
                        href={`/portal/zamowienie?reorder=${o.id}`}
                        className="text-sm text-[#1F3A5F] hover:underline"
                      >
                        Powtórz
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
