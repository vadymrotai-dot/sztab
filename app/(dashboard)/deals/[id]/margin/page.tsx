import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { listDealItems } from '@/app/actions/deals'
import { InternalMarginView } from '@/components/deals/internal-margin-view'

export const metadata = {
  title: 'Marża — widok wewnętrzny',
}

export default async function DealMarginPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Hard owner gate before exposing cost/margin numbers — RLS gives us
  // belt, this gives us suspenders. Deals shared via future read-only
  // links must NOT be able to reach /margin.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: deal }, items] = await Promise.all([
    supabase
      .from('deals')
      .select(
        '*, client:clients(id, title, client_type, contracted_margin_katalog_pct, contracted_margin_docel_pct)',
      )
      .eq('id', id)
      .eq('owner_id', user.id)
      .single(),
    listDealItems(id),
  ])

  if (!deal) {
    notFound()
  }

  const client = deal.client as
    | {
        id: string
        title: string
        client_type: 'standard' | 'strategic_partner' | null
        contracted_margin_katalog_pct: number | null
        contracted_margin_docel_pct: number | null
      }
    | null

  return (
    <div className="flex flex-col">
      <PageHeader
        title={`Marża: ${deal.title as string}`}
        breadcrumbs={[
          { label: 'Umowy', href: '/deals' },
          { label: deal.title as string, href: `/deals/${id}` },
          { label: 'Marża' },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link href={`/deals/${id}`}>
              <ArrowLeftIcon className="mr-2 size-4" />
              Wróć do szansy
            </Link>
          </Button>
        }
      />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Widok wewnętrzny.</strong> Pokazuje koszty zakupu i marżę —
          nie udostępniaj tej strony klientowi.
        </div>
        <InternalMarginView
          items={items}
          client={
            client
              ? {
                  title: client.title,
                  client_type: client.client_type,
                  contracted_margin_katalog_pct:
                    client.contracted_margin_katalog_pct,
                  contracted_margin_docel_pct:
                    client.contracted_margin_docel_pct,
                }
              : null
          }
        />
      </div>
    </div>
  )
}
