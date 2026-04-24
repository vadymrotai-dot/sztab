import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { DealsKanban } from '@/components/deals/deals-kanban'
import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'
import Link from 'next/link'

export default async function DealsPage() {
  const supabase = await createClient()

  const { data: deals } = await supabase
    .from('deals')
    .select('*, client:clients(id, title)')
    .order('updated_at', { ascending: false })

  const { data: clients } = await supabase
    .from('clients')
    .select('id, title')
    .order('title', { ascending: true })

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Umowy"
        actions={
          <Button asChild>
            <Link href="/deals/new">
              <PlusIcon className="mr-2 size-4" />
              Nowa umowa
            </Link>
          </Button>
        }
      />
      <DealsKanban deals={deals || []} clients={clients || []} />
    </div>
  )
}
