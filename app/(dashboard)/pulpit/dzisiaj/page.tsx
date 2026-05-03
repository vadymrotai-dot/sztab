// app/(dashboard)/pulpit/dzisiaj/page.tsx
// Sprint S4 Phase 3 — operational dashboard.
//
// DROP from old: 6 colored cards з '0', cron debug talk
// (e.g. "Cron bzp-monitor uruchamia się o 03:00."), TODO Pikniko placeholder.
//
// NEW: Header + warnings panel (auto-hide gdy 0) + calendar widget
// з toggle Split focus / Time grid + Hot leady chips.

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { WarningsPanel } from '@/components/dzis/warnings-panel'
import { CalendarShell } from '@/components/dzis/calendar-shell'
import { HotLeadyChips, type HotLead } from '@/components/dzis/hot-leady-chips'
import { IntelligenceModesBlock } from '@/components/dzis/intelligence-modes-block'
import type { CalendarEvent, EventSeverity } from '@/components/dzis/calendar-types'

export const dynamic = 'force-dynamic'

function severityForTask(t: { priority: string | null; time: string | null; done: boolean | null }): EventSeverity {
  if (t.done) return 'done'
  if (t.priority === 'high') return 'urgent'
  if (t.priority === 'normal' && t.time) return 'progress'
  return 'planned'
}

export default async function DailyDashboardPage() {
  const supabase = await createClient()
  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)
  const next7DaysISO = new Date(today.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)
  const last24h = new Date(today.getTime() - 24 * 3_600_000).toISOString()
  const stale30dThreshold = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
  const month = today.getMonth() + 1
  const day = today.getDate()

  const [
    { count: clientsNoAiCount },
    { count: staleClientsCount },
    { count: bzpRecentCount },
    { data: tasks },
    { data: birthdaysToday },
    { data: topMatches },
    { data: clientsWithProfile },
  ] = await Promise.all([
    // 1. Clients без AI analizy
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .is('business_profile', null),
    // 2. Stale data >30 dni
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .lt('last_filing_date', stale30dThreshold),
    // 3. Nowe BZP w ostatnich 24h
    supabase
      .from('bzp_tenders')
      .select('id', { count: 'exact', head: true })
      .gte('fetched_at', last24h),
    // 4. Tasks дla calendar (today + next 7 days)
    supabase
      .from('tasks')
      .select('id, title, due, time, priority, done, client_id')
      .gte('due', todayISO)
      .lte('due', next7DaysISO),
    // 5. Person events today (urodziny / imieniny)
    supabase
      .from('person_events')
      .select('id, typ, opis, miesiac, dzien, person:persons(id, imie, nazwisko)')
      .eq('miesiac', month)
      .eq('dzien', day)
      .eq('repeat_yearly', true),
    // 6. Top matches дla Hot leady
    supabase
      .from('matches')
      .select('client_id, combined_score')
      .gte('combined_score', 80)
      .order('combined_score', { ascending: false })
      .limit(50),
    // 7. Clients з business_profile (AI done)
    supabase
      .from('clients')
      .select('id, title, business_profile')
      .not('business_profile', 'is', null)
      .limit(500),
  ])

  // Build hot leady — clients з AI profile + top match >= 80.
  // (Note: "no contact >7d" filter deferred to Sprint S5 — wymaga
  // contact recency join.)
  const profileIds = new Set(
    ((clientsWithProfile ?? []) as Array<{ id: string; title: string }>).map((c) => c.id),
  )
  const titleById = new Map<string, string>()
  for (const c of (clientsWithProfile ?? []) as Array<{ id: string; title: string }>) {
    titleById.set(c.id, c.title)
  }
  const seenLeads = new Set<string>()
  const hotLeads: HotLead[] = []
  for (const m of (topMatches ?? []) as Array<{ client_id: string | null; combined_score: number }>) {
    if (!m.client_id) continue
    if (seenLeads.has(m.client_id)) continue
    if (!profileIds.has(m.client_id)) continue
    const name = titleById.get(m.client_id)
    if (!name) continue
    seenLeads.add(m.client_id)
    hotLeads.push({ id: m.client_id, name, score: m.combined_score })
    if (hotLeads.length >= 8) break
  }

  // Build calendar events
  const calendarEvents: CalendarEvent[] = []
  for (const t of (tasks ?? []) as Array<{
    id: string
    title: string
    due: string | null
    time: string | null
    priority: string | null
    done: boolean | null
    client_id: string | null
  }>) {
    if (!t.due) continue
    calendarEvents.push({
      id: `task-${t.id}`,
      title: t.title,
      date: t.due.slice(0, 10),
      time: t.time ? t.time.slice(0, 5) : null,
      severity: severityForTask(t),
      href: t.client_id ? `/clients/${t.client_id}` : '/tasks',
      badge: t.client_id ? titleById.get(t.client_id) ?? null : null,
    })
  }
  type PersonEventRow = {
    id: string
    typ: string
    opis: string | null
    miesiac: number
    dzien: number
    person: { id: string; imie: string; nazwisko: string } | { id: string; imie: string; nazwisko: string }[]
  }
  for (const ev of (birthdaysToday ?? []) as PersonEventRow[]) {
    const p = Array.isArray(ev.person) ? ev.person[0] : ev.person
    if (!p) continue
    calendarEvents.push({
      id: `pe-${ev.id}`,
      title: `${ev.typ}: ${p.imie} ${p.nazwisko}`,
      date: todayISO,
      time: null,
      severity: 'planned',
      href: `/persons/${p.id}`,
      badge: ev.opis ?? null,
    })
  }

  const todayPl = today.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col bg-[#FAFAF7] min-h-screen">
      <PageHeader title="Dziś" breadcrumbs={[{ label: 'Dziś' }]} />
      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* Header row: date + hot leady */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-medium leading-tight">Dziś</h1>
            <p className="mt-0.5 text-[13px] text-[#555]">{todayPl}</p>
          </div>
          {hotLeads.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-[#888]">
                Hot leady ({hotLeads.length})
              </span>
              <HotLeadyChips leads={hotLeads.slice(0, 5)} compact />
            </div>
          )}
        </div>

        {/* Sprint S-CORE.1.C — 3 cards modes (Tryb pracy) — над WarningsPanel */}
        <IntelligenceModesBlock />

        {/* Warnings panel — auto-hides gdy wszystko 0 */}
        <WarningsPanel
          warnings={[
            {
              count: clientsNoAiCount ?? 0,
              message: 'klientów bez analizy AI',
              actionLabel: 'Analizuj wszystkie',
              actionHref: '/clients?tab=klienci',
              variant: 'primary',
              icon: 'analyze',
            },
            {
              count: staleClientsCount ?? 0,
              message: 'klientów z stale data >30 dni',
              actionLabel: 'Odśwież z KRS',
              actionHref: '/clients?tab=klienci',
              variant: 'secondary',
              icon: 'refresh',
            },
            {
              count: bzpRecentCount ?? 0,
              message: 'nowych sygnałów BZP (24h)',
              actionLabel: 'Zobacz',
              actionHref: '/intelligence/lookup',
              variant: 'secondary',
              icon: 'search',
            },
          ]}
        />

        {/* Calendar з toggle Focus / Grid */}
        <CalendarShell events={calendarEvents} todayISO={todayISO} />

        {/* Empty-state hint na dole gdy żadnych eventów + hot leady są */}
        {calendarEvents.length === 0 && hotLeads.length > 0 && (
          <div className="rounded-lg border border-dashed border-[#E5E1D8] bg-white px-5 py-6 text-center">
            <p className="text-[13px] text-[#555]">
              Brak zaplanowanych zadań na dziś. Może zaplanuj kontakt z hot leadem?
            </p>
            <div className="mt-3 flex justify-center">
              <HotLeadyChips leads={hotLeads.slice(0, 3)} compact />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
