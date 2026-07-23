import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { KampanieClient } from './_components/kampanie-client'

export const dynamic = 'force-dynamic'

export interface CampaignRow {
  id: string
  name: string
  status: string
  filter_pkd: string[] | null
  filter_zus: string[] | null
  filter_obyw: string[] | null
  filter_wojewodztwo: string | null
  leads_count: number
  enriched_count: number
  sent_count: number
  replied_count: number
  converted_count: number
  created_at: string
  started_at: string | null
}

export default async function FbaKampaniePage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fba_campaigns')
    .select('id, name, status, filter_pkd, filter_zus, filter_obyw, filter_wojewodztwo, leads_count, enriched_count, sent_count, replied_count, converted_count, created_at, started_at')
    .order('created_at', { ascending: false })

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Kampanie"
        breadcrumbs={[{ label: 'FBA' }, { label: 'Kampanie' }]}
      />
      <KampanieClient
        campaigns={(data ?? []) as CampaignRow[]}
        error={error?.message ?? null}
      />
    </div>
  )
}
