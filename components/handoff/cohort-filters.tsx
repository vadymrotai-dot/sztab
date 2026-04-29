'use client'

// Filters cohort table rows in-place via data attributes (no router state).

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'

export function CohortFilters({ families }: { families: string[] }) {
  const [activeFamily, setActiveFamily] = useState<string | null>(null)
  const [withContactOnly, setWithContactOnly] = useState(false)

  function applyFilters(family: string | null, withContact: boolean) {
    const rows = document.querySelectorAll<HTMLTableRowElement>('.cohort-row')
    rows.forEach((row) => {
      const fam = row.dataset.family ?? ''
      const has = row.dataset.hasContact === '1'
      const familyOK = family === null || fam === family
      const contactOK = !withContact || has
      row.style.display = familyOK && contactOK ? '' : 'none'
    })
  }

  function toggleFamily(f: string) {
    const next = activeFamily === f ? null : f
    setActiveFamily(next)
    applyFilters(next, withContactOnly)
  }

  function toggleContact() {
    const next = !withContactOnly
    setWithContactOnly(next)
    applyFilters(activeFamily, next)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border bg-background p-3">
      <span className="text-xs font-medium text-muted-foreground">Filtry:</span>
      <button
        type="button"
        onClick={toggleContact}
        className={`rounded-full border px-3 py-1 text-xs transition ${
          withContactOnly
            ? 'border-orange-400 bg-orange-50 text-orange-700'
            : 'border-muted-foreground/30 hover:bg-muted'
        }`}
      >
        Tylko z kontaktem
      </button>
      <span className="ml-2 text-xs text-muted-foreground">Rodzina:</span>
      {families.map((f) => (
        <button
          type="button"
          key={f}
          onClick={() => toggleFamily(f)}
          className={`rounded-full border px-3 py-1 text-xs transition ${
            activeFamily === f
              ? 'border-orange-400 bg-orange-50 text-orange-700'
              : 'border-muted-foreground/30 hover:bg-muted'
          }`}
        >
          {f}
        </button>
      ))}
      {(activeFamily || withContactOnly) && (
        <button
          type="button"
          onClick={() => {
            setActiveFamily(null)
            setWithContactOnly(false)
            applyFilters(null, false)
          }}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        >
          Wyczyść
        </button>
      )}
      <Badge variant="outline" className="ml-2 text-[10px]">
        Sortowanie: rank (wyższy score wyżej)
      </Badge>
    </div>
  )
}
