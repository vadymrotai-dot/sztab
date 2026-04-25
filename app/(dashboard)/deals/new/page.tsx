import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { NewDealClient } from './new-deal-client'
import { DEAL_STAGES } from '@/lib/types'
import type { DealStage } from '@/lib/types'

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string
    client?: string
    product?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const [{ data: clients }, { data: products }, { data: people }, { data: suppliers }] =
    await Promise.all([
      supabase.from('clients').select('id, title').order('title', { ascending: true }),
      supabase.from('products').select('id, name').order('name', { ascending: true }),
      supabase
        .from('people')
        .select('id, name, client_id')
        .order('name', { ascending: true }),
      supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
    ])

  const stageParam = params.stage as DealStage | undefined
  const stageDefault = DEAL_STAGES.some((s) => s.value === stageParam)
    ? (stageParam as DealStage)
    : undefined

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Nowa umowa"
        breadcrumbs={[
          { label: 'Umowy', href: '/deals' },
          { label: 'Nowa umowa' },
        ]}
      />
      <NewDealClient
        defaults={{
          stage: stageDefault,
          client_id: params.client,
          product_id: params.product,
        }}
        clients={clients || []}
        products={products || []}
        people={people || []}
        suppliers={suppliers || []}
      />
    </div>
  )
}
