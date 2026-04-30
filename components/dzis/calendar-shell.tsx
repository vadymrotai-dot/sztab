'use client'

// components/dzis/calendar-shell.tsx
// Sprint S4 Phase 3C — wrapper z toggle между Split Focus / Time Grid.
// Persistuje wybór у localStorage 'sztab_calendar_view' (default 'focus').

import { useEffect, useState } from 'react'
import { LayoutListIcon, LayoutGridIcon } from 'lucide-react'
import { CalendarEvent } from './calendar-types'
import { SplitFocusView } from './split-focus-view'
import { TimeGridView } from './time-grid-view'

const STORAGE_KEY = 'sztab_calendar_view'

interface Props {
  events: CalendarEvent[]
  todayISO: string
}

export function CalendarShell({ events, todayISO }: Props) {
  const [view, setView] = useState<'focus' | 'grid'>('focus')

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'grid' || stored === 'focus') {
        setView(stored)
      }
    } catch {}
  }, [])

  function selectView(next: 'focus' | 'grid') {
    setView(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {}
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[#888]">Widok</span>
        <div className="inline-flex rounded-md border border-[#E5E1D8] bg-white p-0.5">
          <button
            type="button"
            onClick={() => selectView('focus')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] ${
              view === 'focus' ? 'bg-[#EEEDFE] text-[#3730A3]' : 'text-[#555] hover:bg-[#FAFAF7]'
            }`}
          >
            <LayoutListIcon className="size-3.5" />
            Split focus
          </button>
          <button
            type="button"
            onClick={() => selectView('grid')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] ${
              view === 'grid' ? 'bg-[#EEEDFE] text-[#3730A3]' : 'text-[#555] hover:bg-[#FAFAF7]'
            }`}
          >
            <LayoutGridIcon className="size-3.5" />
            Time grid
          </button>
        </div>
      </div>
      {view === 'focus' ? (
        <SplitFocusView events={events} todayISO={todayISO} />
      ) : (
        <TimeGridView events={events} todayISO={todayISO} />
      )}
    </div>
  )
}
