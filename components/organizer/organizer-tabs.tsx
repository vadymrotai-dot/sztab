'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const TABS = [
  { value: 'zadania', label: 'Zadania' },
  { value: 'cele', label: 'Cele' },
  { value: 'nawyki', label: 'Nawyki' },
  { value: 'kalkulator', label: 'Kalkulator' },
]

export function OrganizerTabs() {
  const params = useSearchParams()
  const current = params.get('tab') ?? 'zadania'
  return (
    <div className="border-b">
      <nav className="flex gap-1 px-6 -mb-px">
        {TABS.map((t) => {
          const active = t.value === current
          return (
            <Link
              key={t.value}
              href={`/organizer?tab=${t.value}`}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
