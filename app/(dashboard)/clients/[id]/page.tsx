import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PencilIcon, MailIcon, PhoneIcon, MapPinIcon, BuildingIcon, GlobeIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClientContacts } from '@/components/clients/client-contacts'
import { ClientDeals } from '@/components/clients/client-deals'
import { ClientTasks } from '@/components/clients/client-tasks'
import { BusinessDataPanel } from '@/components/clients/business-data-panel'
import { PotentialAnalysisPanel } from '@/components/clients/potential-analysis-panel'
import { NewDealButton } from '@/components/clients/new-deal-button'

const segmentColors: Record<string, string> = {
  maly_opt: 'bg-slate-500',
  sredni_opt: 'bg-blue-500',
  duzy_opt: 'bg-green-500',
  katalog: 'bg-purple-500',
  docel: 'bg-indigo-600',
  niesklasyfikowany: 'bg-gray-400',
}

const statusColors: Record<string, string> = {
  nowy: 'bg-blue-500',
  aktywny: 'bg-green-500',
  nieaktywny: 'bg-gray-400',
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: client },
    { data: contacts },
    { data: deals },
    { data: tasks },
    { data: clients },
    { data: products },
    { data: people },
    { data: suppliers },
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase
      .from('contacts')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('deals')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('*')
      .eq('client_id', id)
      .order('due', { ascending: true }),
    supabase.from('clients').select('id, title').order('title', { ascending: true }),
    supabase.from('products').select('id, name').order('name', { ascending: true }),
    supabase
      .from('people')
      .select('id, name, client_id')
      .order('name', { ascending: true }),
    supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
  ])

  if (!client) {
    notFound()
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title={client.title}
        breadcrumbs={[
          { label: 'Klienci', href: '/clients' },
          { label: client.title },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/clients/${id}/edit`}>
                <PencilIcon className="mr-2 size-4" />
                Edytuj
              </Link>
            </Button>
            <NewDealButton
              clientId={id}
              clients={clients || []}
              products={products || []}
              people={people || []}
              suppliers={suppliers || []}
            />
          </div>
        }
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Row 1: podstawowe dane + podsumowanie */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl">{client.title}</CardTitle>
                  {client.industry && (
                    <CardDescription className="mt-1">{client.industry}</CardDescription>
                  )}
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className={cn('text-white', segmentColors[client.segment] || segmentColors.niesklasyfikowany)}>
                    {client.segment}
                  </Badge>
                  <Badge variant="secondary" className={cn('text-white', statusColors[client.status])}>
                    {client.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {client.nip && (
                  <div className="flex items-center gap-2">
                    <BuildingIcon className="size-4 text-muted-foreground" />
                    <span className="text-sm">NIP: {client.nip}</span>
                  </div>
                )}
                {(client.city || client.address) && (
                  <div className="flex items-center gap-2">
                    <MapPinIcon className="size-4 text-muted-foreground" />
                    <span className="text-sm">
                      {[client.address, client.city, client.region].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                {client.email && (
                  <div className="flex items-center gap-2">
                    <MailIcon className="size-4 text-muted-foreground" />
                    <a href={`mailto:${client.email}`} className="text-sm hover:underline">
                      {client.email}
                    </a>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2">
                    <PhoneIcon className="size-4 text-muted-foreground" />
                    <a href={`tel:${client.phone}`} className="text-sm hover:underline">
                      {client.phone}
                    </a>
                  </div>
                )}
                {client.website && (
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <GlobeIcon className="size-4 text-muted-foreground" />
                    <a
                      href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm hover:underline"
                    >
                      {client.website}
                    </a>
                  </div>
                )}
              </div>
              {client.notes && (
                <div className="mt-6">
                  <h4 className="mb-2 text-sm font-medium">Notatki</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Podsumowanie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Kontakty</span>
                <span className="font-medium">{contacts?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Umowy</span>
                <span className="font-medium">{deals?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Zadania</span>
                <span className="font-medium">{tasks?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Utworzono</span>
                <span className="text-sm">{new Date(client.created_at).toLocaleDateString('pl-PL')}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 2: AI panele - dane biznesowe + potencjal wspolpracy */}
        <div className="grid gap-6 lg:grid-cols-2">
          <BusinessDataPanel clientId={id} initial={client.business_data} />
          <PotentialAnalysisPanel
            clientId={id}
            currentSegment={client.segment}
            initial={client.potential_analysis}
          />
        </div>

        {/* Row 3: zakladki */}
        <Tabs defaultValue="contacts">
          <TabsList>
            <TabsTrigger value="contacts">Kontakty ({contacts?.length || 0})</TabsTrigger>
            <TabsTrigger value="deals">Umowy ({deals?.length || 0})</TabsTrigger>
            <TabsTrigger value="tasks">Zadania ({tasks?.length || 0})</TabsTrigger>
          </TabsList>
          <TabsContent value="contacts" className="mt-4">
            <ClientContacts clientId={id} contacts={contacts || []} />
          </TabsContent>
          <TabsContent value="deals" className="mt-4">
            <ClientDeals clientId={id} deals={deals || []} />
          </TabsContent>
          <TabsContent value="tasks" className="mt-4">
            <ClientTasks clientId={id} tasks={tasks || []} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
