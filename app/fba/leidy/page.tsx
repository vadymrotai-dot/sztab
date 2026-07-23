import { PageHeader } from '@/components/page-header'

export default function FbaLeidyPage() {
  return (
    <div className="flex flex-col">
      <PageHeader title="Leidy" breadcrumbs={[{ label: 'FBA' }, { label: 'Leidy' }]} />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Tabela leidów CEIDG z filtrami — wkrótce dostępne.
        </div>
      </div>
    </div>
  )
}
