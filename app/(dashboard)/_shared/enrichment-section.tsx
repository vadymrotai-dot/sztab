'use client'

// Shared expandable section wrapper для VAT/GUS/etc enrichment data.
// HTML <details> element для native collapsible (browser-managed state).

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EnrichmentSectionProps {
  title: string
  /** Icon shown lewo od title — typically status emoji / lucide icon. */
  icon?: ReactNode
  /** Right-side badge (status indicator). */
  rightBadge?: ReactNode
  /** Default open state. Default true if hasData, false otherwise. */
  defaultOpen?: boolean
  /** Whether this section already has fetched data. */
  hasData: boolean
  /** Last-checked timestamp display string. */
  lastCheckedLabel?: string | null
  children: ReactNode
}

export function EnrichmentSection({
  title,
  icon,
  rightBadge,
  defaultOpen,
  hasData,
  lastCheckedLabel,
  children,
}: EnrichmentSectionProps) {
  const open = defaultOpen ?? hasData
  return (
    <details
      open={open}
      className={cn(
        'group rounded-lg border bg-card p-4',
        !hasData && 'border-dashed bg-muted/30',
      )}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {icon && <span className="shrink-0">{icon}</span>}
            <span>{title}</span>
            {rightBadge}
          </div>
          <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">
            ▼
          </span>
        </div>
        {lastCheckedLabel && (
          <p className="mt-1 text-xs text-muted-foreground">
            Ostatnio sprawdzone: {lastCheckedLabel}
          </p>
        )}
      </summary>
      <div className="mt-4 space-y-2 text-sm">{children}</div>
    </details>
  )
}
