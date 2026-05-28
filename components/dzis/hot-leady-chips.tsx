// components/dzis/hot-leady-chips.tsx
// Sprint S4 Phase 3F — chips dla hot leadów (top score + AI done +
// nie kontakt >7d). Server-safe display, accepts pre-fetched candidates.

import Link from 'next/link'

export interface HotLead {
  id: string
  name: string
  score: number
}

interface Props {
  leads: HotLead[]
  /** Compact = no header, inline rendering. Default = full panel. */
  compact?: boolean
  /** Optional emptyState text gdy 0 leadów. */
  emptyState?: string
}

export function HotLeadyChips({ leads, compact = false, emptyState }: Props) {
  if (leads.length === 0) {
    if (!emptyState) return null
    return <span className="text-[12px] text-[#888]">{emptyState}</span>
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {leads.map((l) => (
          <Link
            key={l.id}
            href={`/clients/${l.id}`}
            className="group inline-flex items-center gap-1.5 rounded-full border border-[#E5E1D8] bg-white px-2.5 py-1 text-[12px] hover:border-[#4F46E5] hover:bg-[#EEEDFE]"
            title={`Score: ${l.score}`}
            prefetch={false}
          >
            <span className="size-1.5 rounded-full bg-[#00A656]" />
            <span className="max-w-[180px] truncate">{l.name}</span>
            <span className="font-mono text-[10px] text-[#888]">{l.score}</span>
          </Link>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[#E5E1D8] bg-white px-4 py-3">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-[#888]">
        Hot leady ({leads.length})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {leads.map((l) => (
          <Link
            key={l.id}
            href={`/clients/${l.id}`}
            className="group inline-flex items-center gap-1.5 rounded-full border border-[#E5E1D8] bg-white px-2.5 py-1 text-[12px] hover:border-[#4F46E5] hover:bg-[#EEEDFE]"
            prefetch={false}
          >
            <span className="size-1.5 rounded-full bg-[#00A656]" />
            <span className="max-w-[180px] truncate">{l.name}</span>
            <span className="font-mono text-[10px] text-[#888]">{l.score}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
