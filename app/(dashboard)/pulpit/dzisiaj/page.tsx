// app/(dashboard)/pulpit/dzisiaj/page.tsx
// Sprint K / Phase 6 — Daily dashboard для Pikniko sales вранці.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CakeIcon,
  CalendarIcon,
  TrophyIcon,
  TrendingUpIcon,
  UsersIcon,
  ListTodoIcon,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DailyDashboardPage() {
  const supabase = await createClient()
  const today = new Date()
  const month = today.getMonth() + 1
  const day = today.getDate()
  const last7Days = new Date(today.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
  const next7Days = new Date(today.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)
  const last24h = new Date(today.getTime() - 24 * 3_600_000).toISOString()
  const last30Days = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)

  const [
    { data: birthdaysToday },
    { data: upcomingEvents },
    { data: bzpRecent },
    { data: financialsRecent },
    { data: msigRecent },
  ] = await Promise.all([
    // 1. Dziś urodziny / imieniny / rocznica
    supabase
      .from('person_events')
      .select(
        'id, typ, opis, person:persons(id, imie, nazwisko, email_glowny, telefon_komorkowy)',
      )
      .eq('miesiac', month)
      .eq('dzien', day)
      .eq('repeat_yearly', true),
    // 2. Najbliższe rocznice (7 dni — current month/day +7)
    supabase
      .from('person_events')
      .select(
        'id, typ, miesiac, dzien, opis, person:persons(id, imie, nazwisko)',
      )
      .eq('repeat_yearly', true)
      .order('miesiac', { ascending: true })
      .order('dzien', { ascending: true })
      .limit(50),
    // 3. Nowe BZP wins last 24h
    supabase
      .from('bzp_tenders')
      .select(
        'id, bzp_notice_id, winner_name, ordering_party, subject, award_value_pln, award_date, client_id, prospect_id',
      )
      .gte('fetched_at', last24h)
      .order('fetched_at', { ascending: false })
      .limit(20),
    // 4. Świeże sprawozdania (filed_at last 30 days)
    supabase
      .from('company_financials')
      .select('id, rok, przychody_pln, zysk_netto_pln, filed_at, client_id, prospect_id')
      .gte('filed_at', last30Days)
      .order('filed_at', { ascending: false })
      .limit(20),
    // 5. Zmiany w zarządach (MSiG last 7 days, change_type=zarząd)
    supabase
      .from('msig_changes')
      .select(
        'id, change_type, publication_date, description, client_id, prospect_id',
      )
      .eq('change_type', 'zarząd')
      .gte('publication_date', last7Days)
      .order('publication_date', { ascending: false })
      .limit(20),
  ])

  // Filter upcoming to next 7 days (handles month-rollover з naive logic)
  const upcomingInRange = ((upcomingEvents ?? []) as Array<{
    id: string
    miesiac: number
    dzien: number
    typ: string
    opis: string | null
    person: { id: string; imie: string; nazwisko: string }
  }>).filter((e) => {
    const eventThisYear = new Date(today.getFullYear(), e.miesiac - 1, e.dzien)
    if (eventThisYear < today) {
      // Already passed — check next year
      const eventNextYear = new Date(today.getFullYear() + 1, e.miesiac - 1, e.dzien)
      const diffDays = (eventNextYear.getTime() - today.getTime()) / 86_400_000
      return diffDays <= 7 && diffDays > 0
    }
    const diffDays = (eventThisYear.getTime() - today.getTime()) / 86_400_000
    return diffDays <= 7 && diffDays >= 0
  })
  // Resolve client names for BZP/financials/msig
  const clientIds = Array.from(
    new Set(
      [
        ...((bzpRecent ?? []) as Array<{ client_id: string | null }>),
        ...((financialsRecent ?? []) as Array<{ client_id: string | null }>),
        ...((msigRecent ?? []) as Array<{ client_id: string | null }>),
      ]
        .map((r) => r.client_id)
        .filter((x): x is string => Boolean(x)),
    ),
  )
  const clientMap = new Map<string, string>()
  if (clientIds.length > 0) {
    const { data: cs } = await supabase
      .from('clients')
      .select('id, title')
      .in('id', clientIds)
    for (const c of (cs ?? []) as Array<{ id: string; title: string }>) {
      clientMap.set(c.id, c.title)
    }
  }
  const todayPl = today.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Dziś"
        breadcrumbs={[{ label: 'Dziś' }]}
      />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-sm text-muted-foreground">{todayPl}</p>

        {/* 1. Dziś urodziny */}
        <Card className="border-l-4 border-l-orange-400 bg-orange-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CakeIcon className="size-5 text-orange-500" />
              Dziś urodziny / wydarzenia ({(birthdaysToday ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!birthdaysToday || birthdaysToday.length === 0) ? (
              <p className="text-sm text-muted-foreground">
                Brak wydarzeń dzisiaj. Dodaj urodziny osób przez panel /persons/[id].
              </p>
            ) : (
              <ul className="divide-y">
                {(birthdaysToday as Array<{
                  id: string
                  typ: string
                  opis: string | null
                  person: { id: string; imie: string; nazwisko: string; email_glowny: string | null; telefon_komorkowy: string | null }
                }>).map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2">
                    <Badge className="bg-orange-500 text-white">{e.typ}</Badge>
                    <Link href={`/persons/${e.person.id}`} className="font-medium hover:underline">
                      {e.person.imie} {e.person.nazwisko}
                    </Link>
                    <div className="ml-auto flex gap-2 text-xs">
                      {e.person.email_glowny && (
                        <a href={`mailto:${e.person.email_glowny}`} className="text-emerald-700 hover:underline">
                          ✉ Wyślij życzenia
                        </a>
                      )}
                      {e.person.telefon_komorkowy && (
                        <a href={`tel:${e.person.telefon_komorkowy}`} className="text-emerald-700 hover:underline">
                          ☏ Zadzwoń
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 2. Najbliższe rocznice (7 dni) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarIcon className="size-5 text-blue-500" />
              Najbliższe rocznice (7 dni) ({upcomingInRange.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingInRange.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak rocznic w najbliższym tygodniu.</p>
            ) : (
              <ul className="divide-y">
                {upcomingInRange.slice(0, 10).map((e) => (
                  <li key={e.id} className="grid grid-cols-12 items-center gap-2 py-2 text-sm">
                    <div className="col-span-2 font-mono text-xs text-muted-foreground">
                      {e.dzien.toString().padStart(2, '0')}-{e.miesiac.toString().padStart(2, '0')}
                    </div>
                    <div className="col-span-2">
                      <Badge variant="outline" className="text-[10px]">
                        {e.typ}
                      </Badge>
                    </div>
                    <div className="col-span-8">
                      <Link href={`/persons/${e.person.id}`} className="hover:underline">
                        {e.person.imie} {e.person.nazwisko}
                      </Link>
                      {e.opis && <span className="ml-2 text-xs text-muted-foreground">{e.opis}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 3. Nowe BZP wins */}
        <Card className="border-l-4 border-l-orange-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrophyIcon className="size-5 text-orange-500" />
              Nowe sygnały kupieckie z BZP (24h) ({(bzpRecent ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!bzpRecent || bzpRecent.length === 0) ? (
              <p className="text-sm text-muted-foreground">
                Brak nowych BZP wins w ostatnich 24h. Cron bzp-monitor uruchamia się o 03:00.
              </p>
            ) : (
              <ul className="divide-y">
                {(bzpRecent as Array<{
                  id: string
                  bzp_notice_id: string
                  winner_name: string | null
                  ordering_party: string | null
                  subject: string | null
                  award_value_pln: number | null
                  award_date: string | null
                  client_id: string | null
                }>).map((b) => (
                  <li key={b.id} className="grid grid-cols-12 items-start gap-2 py-2 text-sm">
                    <div className="col-span-2 text-xs font-mono text-muted-foreground">
                      {b.award_date ? new Date(b.award_date).toLocaleDateString('pl-PL') : '—'}
                    </div>
                    <div className="col-span-7 min-w-0 space-y-0.5">
                      <div className="font-medium truncate" title={b.subject ?? ''}>
                        {b.subject ?? '—'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {b.client_id ? (
                          <Link href={`/clients/${b.client_id}`} className="hover:underline">
                            {clientMap.get(b.client_id) ?? b.winner_name}
                          </Link>
                        ) : (
                          <span>{b.winner_name ?? '—'}</span>
                        )}
                        {' · '}
                        {b.ordering_party ?? '—'}
                      </div>
                    </div>
                    <div className="col-span-3 text-right text-xs font-semibold">
                      {b.award_value_pln
                        ? `${Math.round(b.award_value_pln).toLocaleString('pl-PL')} PLN`
                        : '—'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 4. Świeże sprawozdania */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUpIcon className="size-5 text-emerald-500" />
              Świeże sprawozdania KRS (30 dni) ({(financialsRecent ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!financialsRecent || financialsRecent.length === 0) ? (
              <p className="text-sm text-muted-foreground">
                Brak świeżych sprawozdań w bazie. Uruchom Intelligence Lookup на znanej sp.z o.o./S.A.
              </p>
            ) : (
              <ul className="divide-y">
                {(financialsRecent as Array<{
                  id: string
                  rok: number
                  przychody_pln: number | null
                  zysk_netto_pln: number | null
                  filed_at: string | null
                  client_id: string | null
                }>).map((f) => (
                  <li key={f.id} className="grid grid-cols-12 items-center gap-2 py-2 text-sm">
                    <div className="col-span-2 text-xs font-mono text-muted-foreground">
                      {f.filed_at ? new Date(f.filed_at).toLocaleDateString('pl-PL') : '—'}
                    </div>
                    <div className="col-span-1 font-mono">{f.rok}</div>
                    <div className="col-span-5">
                      {f.client_id ? (
                        <Link href={`/clients/${f.client_id}`} className="hover:underline">
                          {clientMap.get(f.client_id) ?? '—'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div className="col-span-2 text-right text-xs">
                      {f.przychody_pln
                        ? `${(f.przychody_pln / 1_000_000).toFixed(1)}M PLN`
                        : '—'}
                    </div>
                    <div className="col-span-2 text-right text-xs text-muted-foreground">
                      {f.zysk_netto_pln !== null ? `zysk: ${(f.zysk_netto_pln / 1_000).toFixed(0)}K` : '—'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 5. Zmiany w zarządach */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersIcon className="size-5 text-purple-500" />
              Zmiany w zarządach (MSiG, 7 dni) ({(msigRecent ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!msigRecent || msigRecent.length === 0) ? (
              <p className="text-sm text-muted-foreground">
                Brak zmian w zarządach. Cron MSiG monitor (TODO — Sprint L).
              </p>
            ) : (
              <ul className="divide-y">
                {(msigRecent as Array<{
                  id: string
                  publication_date: string | null
                  description: string | null
                  client_id: string | null
                }>).map((m) => (
                  <li key={m.id} className="grid grid-cols-12 items-start gap-2 py-2 text-sm">
                    <div className="col-span-2 text-xs font-mono text-muted-foreground">
                      {m.publication_date
                        ? new Date(m.publication_date).toLocaleDateString('pl-PL')
                        : '—'}
                    </div>
                    <div className="col-span-3">
                      {m.client_id ? (
                        <Link href={`/clients/${m.client_id}`} className="hover:underline">
                          {clientMap.get(m.client_id) ?? '—'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div className="col-span-7 text-xs">{m.description ?? '—'}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 6. TODO Pikniko (placeholder — Sprint L feedback loop) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodoIcon className="size-5 text-gray-500" />
              TODO Pikniko (Sprint L)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Sekcja będzie pokazywać leadów wymagających follow-up на base of last interaction date.
              Pojawi się po dodaniu interaction tracking (Sprint L).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
