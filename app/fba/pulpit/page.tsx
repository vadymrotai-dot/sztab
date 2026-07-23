import { PageHeader } from '@/components/page-header'

export default function FbaPulpitPage() {
  return (
    <div className="flex flex-col">
      <PageHeader title="FBA — Pulpit" breadcrumbs={[{ label: 'FBA' }, { label: 'Pulpit' }]} />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Wszystkich leidów', value: '—', color: 'text-foreground' },
            { label: 'Wysłane maile', value: '—', color: 'text-blue-600' },
            { label: 'Przekazane do FBA', value: '—', color: 'text-amber-600' },
            { label: 'Prowizja (zł)', value: '—', color: 'text-green-600' },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border bg-card p-4">
              <div className={`text-3xl font-bold ${k.color}`}>{k.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{k.label}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Kampanie i lejek sprzedażowy — wkrótce dostępne.
        </div>
      </div>
    </div>
  )
}
