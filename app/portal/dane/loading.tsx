// app/portal/dane/loading.tsx — Suspense-fallback dla "Moje dane".
// Kontur: tytuł + sekcje (Firma / Kontakty / Punkty dostawy / Bezpieczeństwo)
// jako karty z polami. Prezentacyjny, zero danych.

function Section({ rows }: { rows: number }) {
  return (
    <div className="rounded-lg border border-[#E5E1D8] bg-white p-4">
      <div className="mb-4 h-4 w-40 rounded bg-slate-200" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="h-9 flex-1 rounded-md bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DaneLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 animate-pulse">
      <div className="mb-4 h-6 w-40 rounded bg-slate-200" />
      <div className="space-y-4">
        <Section rows={3} />
        <Section rows={2} />
        <Section rows={3} />
        <Section rows={2} />
      </div>
    </div>
  )
}
