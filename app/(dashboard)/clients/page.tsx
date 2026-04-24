import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { ClientsContent } from '@/components/clients/clients-content'
import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'
import Link from 'next/link'

export default async function ClientsPage() {
  const supabase = await createClient()
  
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Klienci"
        actions={
          <Button asChild>
            <Link href="/clients/new">
              <PlusIcon className="mr-2 size-4" />
              Nowy klient
            </Link>
          </Button>
        }
      />
      <ClientsContent clients={clients || []} />
    </div>
  )
}
