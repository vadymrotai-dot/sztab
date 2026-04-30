'use client'

// components/clients/accordion-section.tsx
// Sprint S2B Phase 2D — native <details> accordion. Open by default
// configurable via prop.
//
// Sprint S2B regression fix — must be 'use client' because the
// detailHref <a onClick={stopPropagation}> handler cannot be serialized
// across server→client boundary у Next.js App Router. Without this
// directive /clients/[id] SSR threw 500 for every page що passes detailHref.
// Matches Sprint M FIX 4 pattern (BusinessProfileSection дla Re-analyze).

import * as React from 'react'

interface Props {
  id?: string
  title: string
  /** Right-side meta string in muted small text */
  meta?: string
  /** Optional href for "↗ open detail" link arrow */
  detailHref?: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function AccordionSection({ id, title, meta, detailHref, defaultOpen = false, children }: Props) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group rounded-lg border border-[#E5E1D8] bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 hover:bg-[#FAFAF7]">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <svg
            className="size-4 text-[#888] transition-transform group-open:rotate-90"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 className="text-[18px] font-medium leading-tight">{title}</h2>
          {meta && <span className="truncate text-[12px] text-[#888]">{meta}</span>}
        </div>
        {detailHref && (
          <a
            href={detailHref}
            onClick={(e) => e.stopPropagation()}
            className="text-[12px] text-[#4F46E5] hover:underline whitespace-nowrap"
          >
            ↗ Otwórz
          </a>
        )}
      </summary>
      <div className="border-t border-[#F0EDE5] px-5 py-4">{children}</div>
    </details>
  )
}
