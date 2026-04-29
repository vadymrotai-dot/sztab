'use client'

// Sprint O Phase 7 — sticky anchor navigation для /clients/[id].

import { useEffect, useState } from 'react'

const SECTIONS = [
  { id: 'profil', label: 'Profil' },
  { id: 'sygnaly', label: 'Sygnały' },
  { id: 'analiza', label: 'Analiza' },
  { id: 'osoby', label: 'Osoby' },
  { id: 'dopasowania', label: 'Dopasowania' },
  { id: 'kontakt', label: 'Kontakt' },
  { id: 'aktywnosc', label: 'Aktywność' },
]

export function AnchorNav() {
  const [active, setActive] = useState<string>('profil')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible.length > 0 && visible[0]?.target.id) {
          setActive(visible[0].target.id)
        }
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    )

    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  // Initialize active from URL hash on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash.slice(1)
    if (hash && SECTIONS.some((s) => s.id === hash)) {
      setActive(hash)
      const el = document.getElementById(hash)
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      }
    }
  }, [])

  return (
    <div className="sticky top-0 z-30 -mx-6 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <nav className="flex gap-1 -mb-px overflow-x-auto">
        {SECTIONS.map((s) => {
          const isActive = active === s.id
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault()
                const el = document.getElementById(s.id)
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  history.replaceState(null, '', `#${s.id}`)
                  setActive(s.id)
                }
              }}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
              }`}
            >
              {s.label}
            </a>
          )
        })}
      </nav>
    </div>
  )
}
