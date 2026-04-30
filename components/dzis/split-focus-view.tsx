'use client'

// components/dzis/split-focus-view.tsx
// Sprint S4 Phase 3D — V3 calendar layout. Left 1fr: timeline of today's
// hours 8-22 з event cards. Right 180px: mini-week 7 dni з dot indicators.

import Link from 'next/link'
import {
  CalendarEvent,
  HOUR_END,
  HOUR_START,
  SEVERITY_COLORS,
} from './calendar-types'

interface Props {
  events: CalendarEvent[]
  /** ISO YYYY-MM-DD дla "today". */
  todayISO: string
}

function eventHour(e: CalendarEvent): number | null {
  if (!e.time) return null
  const [hRaw] = e.time.split(':')
  const h = parseInt(hRaw, 10)
  if (Number.isNaN(h)) return null
  return h
}

function buildWeekDates(todayISO: string): Array<{ iso: string; dayName: string; day: number }> {
  const today = new Date(todayISO)
  const days: Array<{ iso: string; dayName: string; day: number }> = []
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(today.getTime() + i * 86_400_000)
    const iso = d.toISOString().slice(0, 10)
    days.push({
      iso,
      dayName: d.toLocaleDateString('pl-PL', { weekday: 'short' }),
      day: d.getDate(),
    })
  }
  return days
}

export function SplitFocusView({ events, todayISO }: Props) {
  const todaysEvents = events.filter((e) => e.date === todayISO)
  const allDayToday = todaysEvents.filter((e) => !e.time)
  const timedToday = todaysEvents.filter((e) => e.time !== null)

  // Group by hour
  const byHour = new Map<number, CalendarEvent[]>()
  for (const e of timedToday) {
    const h = eventHour(e)
    if (h === null || h < HOUR_START || h > HOUR_END) continue
    if (!byHour.has(h)) byHour.set(h, [])
    byHour.get(h)!.push(e)
  }

  const week = buildWeekDates(todayISO)
  const eventsByDate = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    if (!eventsByDate.has(e.date)) eventsByDate.set(e.date, [])
    eventsByDate.get(e.date)!.push(e)
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_180px]">
      {/* Timeline left */}
      <div className="rounded-lg border border-[#E5E1D8] bg-white">
        <div className="border-b border-[#F0EDE5] px-4 py-2 text-[10px] uppercase tracking-wider text-[#888]">
          Dziś — timeline
        </div>
        {allDayToday.length > 0 && (
          <div className="border-b border-[#F0EDE5] bg-[#FAFAF7] px-4 py-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#888]">
              Cały dzień
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allDayToday.map((e) => (
                <EventChip key={e.id} event={e} />
              ))}
            </div>
          </div>
        )}
        <div className="divide-y divide-[#F0EDE5]">
          {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i).map(
            (h) => {
              const evs = byHour.get(h) ?? []
              return (
                <div key={h} className="grid grid-cols-[60px_1fr] gap-3 px-4 py-2">
                  <div className="text-[12px] font-mono text-[#888]">
                    {h.toString().padStart(2, '0')}:00
                  </div>
                  <div className="flex flex-col gap-1">
                    {evs.length === 0 ? (
                      <span className="text-[12px] text-[#BBB]">—</span>
                    ) : (
                      evs.map((e) => <EventCard key={e.id} event={e} />)
                    )}
                  </div>
                </div>
              )
            },
          )}
        </div>
      </div>

      {/* Mini week right */}
      <div className="rounded-lg border border-[#E5E1D8] bg-white">
        <div className="border-b border-[#F0EDE5] px-3 py-2 text-[10px] uppercase tracking-wider text-[#888]">
          7 dni
        </div>
        <ul className="divide-y divide-[#F0EDE5]">
          {week.map((d) => {
            const dayEvents = eventsByDate.get(d.iso) ?? []
            const severities = new Set(dayEvents.map((e) => e.severity))
            const isToday = d.iso === todayISO
            return (
              <li
                key={d.iso}
                className={`flex items-center gap-2 px-3 py-2 ${isToday ? 'bg-[#EEEDFE]' : ''}`}
              >
                <div className={`w-12 text-[12px] ${isToday ? 'font-medium text-[#4F46E5]' : 'text-[#555]'}`}>
                  {d.dayName} {d.day}
                </div>
                <div className="flex flex-1 items-center gap-1">
                  {severities.size === 0 ? (
                    <span className="size-1.5 rounded-full bg-[#F0EDE5]" />
                  ) : (
                    Array.from(severities).map((s) => (
                      <span
                        key={s}
                        className={`size-1.5 rounded-full ${SEVERITY_COLORS[s].dot}`}
                      />
                    ))
                  )}
                </div>
                {dayEvents.length > 0 && (
                  <span className="font-mono text-[10px] text-[#888]">{dayEvents.length}</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function EventCard({ event }: { event: CalendarEvent }) {
  const c = SEVERITY_COLORS[event.severity]
  const inner = (
    <div className={`flex items-start gap-2 rounded-md border-l-2 ${c.bg} ${c.border} px-2 py-1`}>
      <div className="min-w-0 flex-1">
        <div className={`text-[12px] font-medium leading-tight ${c.text}`}>{event.title}</div>
        {event.badge && <div className="mt-0.5 text-[10px] text-[#888]">{event.badge}</div>}
      </div>
      {event.time && (
        <span className="font-mono text-[10px] text-[#888]">{event.time}</span>
      )}
    </div>
  )
  if (event.href) {
    return <Link href={event.href} className="block hover:opacity-80">{inner}</Link>
  }
  return inner
}

function EventChip({ event }: { event: CalendarEvent }) {
  const c = SEVERITY_COLORS[event.severity]
  const inner = (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${c.bg} px-2 py-0.5 text-[12px] ${c.text}`}>
      <span className={`size-1.5 rounded-full ${c.dot}`} />
      {event.title}
    </span>
  )
  if (event.href) return <Link href={event.href}>{inner}</Link>
  return inner
}
