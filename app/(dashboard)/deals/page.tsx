import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { DealsKanban } from '@/components/deals/deals-kanban'
import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'
import Link from 'next/link'

export default async function DealsPage() {
  const supabase = await createClient()

  // deals.product_id was dropped in migration 010 — items count comes
  // from deal_items via PostgREST aggregate `deal_items(count)`, which
  // returns [{ count: number }].
  const { data: deals } = await supabase
    .from('deals')
    .select(
      '*, client:clients(id, title, client_type, contracted_margin_katalog_pct, contracted_margin_docel_pct), deal_items(count)',
    )
    .order('updated_at', { ascending: false })

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Umowy"
        actions={
          <Button size="lg" asChild>
            <Link href="/deals/new">
              <PlusIcon className="mr-2 size-4" />
              Nowa umowa
            </Link>
          </Button>
        }
      />
      <DealsKanban deals={deals || []} />
    </div>
  )
}
