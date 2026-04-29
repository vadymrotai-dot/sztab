// app/(dashboard)/persons/[id]/page.tsx
// Sprint K / Phase 5 — Person profile page.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  MailIcon,
  PhoneIcon,
  LinkedinIcon,
  CakeIcon,
  CrownIcon,
  StarIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonEditPanel } from '@/components/persons/person-edit-panel'
import { AddEventModal } from '@/components/persons/add-event-modal'

export const dynamic = 'force-dynamic'

interface CompanyLink {
  id: string
  rola: string
  jest_decyzyjny: boolean
  sila_relacji: number
  zrodlo: string
  data_od: string | null
  data_do: string | null
  client?: { id: string; title: string } | null
  prospect?: { id: string; name: string } | null
}

interface PersonEvent {
  id: string
  typ: string
  data: string | null
  miesiac: number | null
  dzien: number | null
  opis: string | null
  repeat_yearly: boolean
  zrodlo: string
}

function isToday(month: number | null, day: number | null): boolean {
  if (!month || !day) return false
  const today = new Date()
  return today.getMonth() + 1 === month && today.getDate() === day
}

export default async function PersonProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: person }, { data: linksData }, { data: eventsData }] = await Promise.all([
    supabase.from('persons').select('*').eq('id', id).single(),
    supabase
      .from('person_company_links')
      .select(
        'id, rola, jest_decyzyjny, sila_relacji, zrodlo, data_od, data_do, client:clients(id, title), prospect:ceidg_prospects(id, name)',
      )
      .eq('person_id', id)
      .order('jest_decyzyjny', { ascending: false }),
    supabase
      .from('person_events')
      .select('id, typ, data, miesiac, dzien, opis, repeat_yearly, zrodlo')
      .eq('person_id', id)
      .order('data', { ascending: true, nullsFirst: false }),
  ])

  if (!person) notFound()

  const links = (linksData ?? []) as CompanyLink[]
  const events = (eventsData ?? []) as PersonEvent[]
  const currentLink = links.find((l) => !l.data_do) ?? links[0]
  const initials = `${person.imie[0] ?? '?'}${person.nazwisko[0] ?? ''}`.toUpperCase()
  const todayEvents = events.filter((e) => isToday(e.miesiac, e.dzien))

  return (
    <div className="flex flex-col">
      <PageHeader
        title={`${person.imie} ${person.nazwisko}`}
        breadcrumbs={[{ label: 'Osoby', href: '/persons' }, { label: `${person.imie} ${person.nazwisko}` }]}
      />
      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* Header card */}
        <Card>
          <CardContent className="flex items-start gap-4 p-6">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-2xl font-semibold">
              {initials}
            </div>
            <div className="flex-1 space-y-2">
              <h1 className="text-2xl font-semibold">
                {person.imie} {person.nazwisko}
              </h1>
              {currentLink && (
                <p className="text-sm text-muted-foreground">
                  {currentLink.rola} ·{' '}
                  {currentLink.client ? (
                    <Link href={`/clients/${currentLink.client.id}`} className="hover:underline">
                      {currentLink.client.title}
                    </Link>
                  ) : currentLink.prospect ? (
                    <span>{currentLink.prospect.name}</span>
                  ) : (
                    <span>—</span>
                  )}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {todayEvents.length > 0 && (
                  <Badge className="bg-orange-500 text-white">
                    🎂 Wydarzenie dzisiaj!
                  </Badge>
                )}
                {currentLink?.jest_decyzyjny && (
                  <Badge className="bg-amber-500 text-white">
                    <CrownIcon className="size-3 mr-1" />
                    Decyzyjny
                  </Badge>
                )}
                {currentLink && currentLink.sila_relacji > 0 && (
                  <Badge variant="outline">
                    <StarIcon className="size-3 mr-1" />
                    Siła relacji {currentLink.sila_relacji}/100
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's events highlight */}
        {todayEvents.length > 0 && (
          <Card className="border-l-4 border-l-orange-400 bg-orange-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CakeIcon className="size-5 text-orange-500" />
                Wydarzenia dzisiaj
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {todayEvents.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                    <div>
                      <Badge className="bg-orange-500 text-white mr-2">{e.typ}</Badge>
                      {e.opis ?? ''}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Contact channels */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kanały kontaktu</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {person.email_glowny && (
                <ContactRow
                  icon={<MailIcon className="size-4 text-emerald-600" />}
                  label="Email główny"
                  value={person.email_glowny}
                  href={`mailto:${person.email_glowny}`}
                  source={(person.zrodla_pol as Record<string, string> | null)?.email_glowny}
                />
              )}
              {person.telefon_komorkowy && (
                <ContactRow
                  icon={<PhoneIcon className="size-4 text-emerald-600" />}
                  label="Telefon komórkowy"
                  value={person.telefon_komorkowy}
                  href={`tel:${person.telefon_komorkowy}`}
                  source={(person.zrodla_pol as Record<string, string> | null)?.telefon_komorkowy}
                />
              )}
              {person.linkedin_url && (
                <ContactRow
                  icon={<LinkedinIcon className="size-4 text-blue-600" />}
                  label="LinkedIn"
                  value={person.linkedin_url}
                  href={person.linkedin_url}
                  source={(person.zrodla_pol as Record<string, string> | null)?.linkedin_url}
                />
              )}
              {person.email_prywatny && (
                <ContactRow
                  icon={<MailIcon className="size-4 text-amber-600" />}
                  label="Email prywatny"
                  value={person.email_prywatny}
                  href={`mailto:${person.email_prywatny}`}
                  source={(person.zrodla_pol as Record<string, string> | null)?.email_prywatny}
                />
              )}
              {!person.email_glowny &&
                !person.telefon_komorkowy &&
                !person.linkedin_url &&
                !person.email_prywatny && (
                  <li className="col-span-full text-sm text-muted-foreground">
                    Brak danych kontaktowych. Możesz dodać przez panel edycji.
                  </li>
                )}
            </ul>
          </CardContent>
        </Card>

        {/* Wydarzenia osobiste */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Wydarzenia osobiste</CardTitle>
            <AddEventModal personId={id} />
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Brak wydarzeń. Dodaj urodziny, imieniny lub rocznice по rozmowie.
              </p>
            ) : (
              <ul className="divide-y">
                {events.map((e) => {
                  const isTodayEvent = isToday(e.miesiac, e.dzien)
                  const date =
                    e.data ??
                    (e.miesiac && e.dzien
                      ? `${e.dzien.toString().padStart(2, '0')}-${e.miesiac.toString().padStart(2, '0')}`
                      : '—')
                  return (
                    <li
                      key={e.id}
                      className={cn(
                        'grid grid-cols-12 items-start gap-2 py-2 text-sm',
                        isTodayEvent && 'bg-orange-50/50 -mx-3 px-3',
                      )}
                    >
                      <div className="col-span-2 text-xs font-mono text-muted-foreground pt-0.5">
                        {date}
                      </div>
                      <div className="col-span-2">
                        <Badge className="bg-purple-600 text-white h-5 text-[10px]">{e.typ}</Badge>
                      </div>
                      <div className="col-span-7 text-xs">{e.opis ?? '—'}</div>
                      <div className="col-span-1 text-right">
                        {e.repeat_yearly && (
                          <span className="text-[10px] text-muted-foreground" title="Powtarza się co roku">
                            ↻
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Powiązane firmy (career history) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Powiązane firmy ({links.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak powiązań.</p>
            ) : (
              <ul className="divide-y">
                {links.map((l) => (
                  <li key={l.id} className="grid grid-cols-12 items-start gap-2 py-2 text-sm">
                    <div className="col-span-3 text-xs text-muted-foreground pt-0.5">
                      {l.data_od ? new Date(l.data_od).toLocaleDateString('pl-PL') : '—'} →{' '}
                      {l.data_do ? new Date(l.data_do).toLocaleDateString('pl-PL') : 'obecnie'}
                    </div>
                    <div className="col-span-6 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {l.client ? (
                          <Link href={`/clients/${l.client.id}`} className="font-medium hover:underline">
                            {l.client.title}
                          </Link>
                        ) : l.prospect ? (
                          <span className="font-medium">{l.prospect.name}</span>
                        ) : (
                          <span>—</span>
                        )}
                        {l.jest_decyzyjny && (
                          <Badge className="bg-amber-500 text-white h-4 text-[9px]">
                            decyzyjny
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{l.rola}</p>
                    </div>
                    <div className="col-span-3 text-right">
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {l.zrodlo}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Zainteresowania + mocne strony */}
        {(person.zainteresowania?.length || person.mocne_strony?.length) ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Zainteresowania i mocne strony</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {person.zainteresowania?.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    Zainteresowania:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(person.zainteresowania as string[]).map((z, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {z}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {person.mocne_strony?.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Mocne strony:</div>
                  <div className="flex flex-wrap gap-1">
                    {(person.mocne_strony as string[]).map((s, idx) => (
                      <Badge key={idx} className="bg-emerald-100 text-emerald-800 text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Notatki wewnętrzne */}
        {person.notatki_wewnetrzne && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notatki wewnętrzne</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{person.notatki_wewnetrzne}</p>
            </CardContent>
          </Card>
        )}

        {/* Sprint K / Phase 7 — manual edit */}
        <PersonEditPanel
          person={{
            id,
            imie: person.imie,
            nazwisko: person.nazwisko,
            email_glowny: person.email_glowny,
            email_prywatny: person.email_prywatny,
            telefon_komorkowy: person.telefon_komorkowy,
            linkedin_url: person.linkedin_url,
            data_urodzenia: person.data_urodzenia,
            miesiac_urodzenia: person.miesiac_urodzenia,
            dzien_urodzenia: person.dzien_urodzenia,
            zainteresowania: person.zainteresowania ?? [],
            mocne_strony: person.mocne_strony ?? [],
            notatki_wewnetrzne: person.notatki_wewnetrzne,
          }}
        />
      </div>
    </div>
  )
}

function ContactRow({
  icon,
  label,
  value,
  href,
  source,
}: {
  icon: React.ReactNode
  label: string
  value: string
  href: string
  source?: string
}) {
  return (
    <li className="flex items-start gap-2 rounded border bg-background p-2">
      <div className="pt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <a href={href} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
          {value}
        </a>
      </div>
      {source && (
        <Badge variant="outline" className="h-4 text-[10px] font-mono">
          {source}
        </Badge>
      )}
    </li>
  )
}
