// components/dzis/warnings-panel.tsx
// Sprint S4 Phase 3B — operational warnings. Auto-hides gdy wszystkie 0.

import Link from 'next/link'
import { AlertCircleIcon, RefreshCcwIcon, SearchIcon } from 'lucide-react'

interface Warning {
  count: number
  message: string
  actionLabel: string
  actionHref?: string
  /** When set, button rendered as <a href>, в przeciwnym razie disabled. */
  variant?: 'primary' | 'secondary'
  icon?: 'analyze' | 'refresh' | 'search'
}

interface Props {
  warnings: Warning[]
}

function iconFor(name: Warning['icon']) {
  if (name === 'refresh') return <RefreshCcwIcon className="size-3.5" />
  if (name === 'search') return <SearchIcon className="size-3.5" />
  return <AlertCircleIcon className="size-3.5" />
}

export function WarningsPanel({ warnings }: Props) {
  const visible = warnings.filter((w) => w.count > 0)
  if (visible.length === 0) return null

  return (
    <div className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-5 py-3">
      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-[#92400E]">
        <AlertCircleIcon className="size-3.5" />
        Wymaga uwagi ({visible.length})
      </div>
      <ul className="divide-y divide-[#FCE9B5]">
        {visible.map((w, i) => (
          <li key={i} className="flex flex-wrap items-center gap-3 py-2">
            <span className="text-[14px]">
              <span className="font-medium">{w.count}</span> {w.message}
            </span>
            <div className="ml-auto">
              {w.actionHref ? (
                <Link
                  href={w.actionHref}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium ${
                    w.variant === 'primary'
                      ? 'bg-[#4F46E5] text-white hover:bg-[#4338CA]'
                      : 'border border-[#E5E1D8] bg-white text-[#0A0A0A] hover:bg-[#FAFAF7]'
                  }`}
                >
                  {iconFor(w.icon)}
                  {w.actionLabel}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#E5E1D8] bg-white px-3 py-1.5 text-[13px] text-[#888]">
                  {iconFor(w.icon)}
                  {w.actionLabel}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
