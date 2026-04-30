'use client'

// components/dzis/time-grid-view.tsx
// Sprint S4 Phase 3E — V1 calendar layout. Single-day full hour grid
// з events placed on time slots. Larger viewport dla full focus.

import Link from 'next/link'
import {
  CalendarEvent,
  HOUR_END,
  HOUR_START,
  SEVERITY_COLORS,
} from './calendar-types'

interface Props {
  events: CalendarEvent[]
  todayISO: string
}

function eventHour(e: CalendarEvent): number | null {
  if (!e.time) return null
  const [hRaw] = e.time.split(':')
  const h = parseInt(hRaw, 10)
  return Number.isNaN(h) ? null : h
}

export function TimeGridView({ events, todayISO }: Props) {
  const todaysEvents = events.filter((e) => e.date === todayISO)
  const allDay = todaysEvents.filter((e) => !e.time)
  const timed = todaysEvents.filter((e) => e.time !== null)

  const byHour = new Map<number, CalendarEvent[]>()
  for (const e of timed) {
    const h = eventHour(e)
    if (h === null || h < HOUR_START || h > HOUR_END) continue
    if (!byHour.has(h)) byHour.set(h, [])
    byHour.get(h)!.push(e)
  }

  return (
    <div className="rounded-lg border border-[#E5E1D8] bg-white">
      <div className="border-b border-[#F0EDE5] px-4 py-2 text-[10px] uppercase tracking-wider text-[#888]">
        Dziś — pełna siatka godzin
      </div>
      {allDay.length > 0 && (
        <div className="border-b border-[#F0EDE5] bg-[#FAFAF7] px-4 py-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-[#888]">Cały dzień</div>
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
            {allDay.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-[80px_1fr]">
        {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i).map((h) => {
          const evs = byHour.get(h) ?? []
          return (
            <ContentsFragment key={h}>
              <div className="border-r border-b border-[#F0EDE5] px-3 py-3 font-mono text-[12px] text-[#888]">
                {h.toString().padStart(2, '0')}:00
              </div>
              <div className="border-b border-[#F0EDE5] px-3 py-3">
                {evs.length === 0 ? (
                  <span className="text-[12px] text-[#BBB]">—</span>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {evs.map((e) => (
                      <EventCard key={e.id} event={e} />
                    ))}
                  </div>
                )}
              </div>
            </ContentsFragment>
          )
        })}
      </div>
    </div>
  )
}

function ContentsFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function EventCard({ event }: { event: CalendarEvent }) {
  const c = SEVERITY_COLORS[event.severity]
  const inner = (
    <div className={`flex items-start gap-2 rounded-md border-l-2 ${c.bg} ${c.border} px-3 py-1.5`}>
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] font-medium leading-tight ${c.text}`}>{event.title}</div>
        {event.badge && <div className="mt-0.5 text-[11px] text-[#888]">{event.badge}</div>}
      </div>
      {event.time && (
        <span className="font-mono text-[11px] text-[#888]">{event.time}</span>
      )}
    </div>
  )
  if (event.href) {
    return <Link href={event.href} className="block hover:opacity-80">{inner}</Link>
  }
  return inner
}
