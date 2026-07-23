import { PageHeader } from '@/components/page-header'

export default function FbaProwizjePage() {
  return (
    <div className="flex flex-col">
      <PageHeader title="Prowizje" breadcrumbs={[{ label: 'FBA' }, { label: 'Prowizje' }]} />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Przekazane do FBA i wyniki — wkrótce dostępne.
        </div>
      </div>
    </div>
  )
}
