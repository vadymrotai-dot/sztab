import { PageHeader } from '@/components/page-header'

export default function FbaKampaniePage() {
  return (
    <div className="flex flex-col">
      <PageHeader title="Kampanie" breadcrumbs={[{ label: 'FBA' }, { label: 'Kampanie' }]} />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Lista kampanii CEIDG — wkrótce dostępne.
        </div>
      </div>
    </div>
  )
}
