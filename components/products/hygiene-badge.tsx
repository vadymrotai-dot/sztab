// components/products/hygiene-badge.tsx
// Wizualny status wzbogacenia produktu (CLEAN / DIRTY / UNCHECKED).
// Hover tooltip pokazuje listę missing required attributes z hygiene_issues.

'use client'

import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { CheckCircle2Icon, AlertCircleIcon, CircleHelpIcon } from 'lucide-react'

export interface HygieneBadgeProps {
  status: 'CLEAN' | 'DIRTY' | 'UNCHECKED' | null | undefined
  issues?: Array<{ key: string; issue: string }> | null
  className?: string
}

export function HygieneBadge({ status, issues, className }: HygieneBadgeProps) {
  const safeStatus = status ?? 'UNCHECKED'
  const config = {
    CLEAN: {
      label: 'CLEAN',
      icon: CheckCircle2Icon,
      classes: 'bg-green-500 text-white',
    },
    DIRTY: {
      label: 'DIRTY',
      icon: AlertCircleIcon,
      classes: 'bg-amber-500 text-white',
    },
    UNCHECKED: {
      label: '—',
      icon: CircleHelpIcon,
      classes: 'bg-gray-300 text-gray-700',
    },
  }[safeStatus]

  const Icon = config.icon
  const issuesList = issues ?? []

  const trigger = (
    <Badge variant="secondary" className={cn(config.classes, 'gap-1', className)}>
      <Icon className="size-3" />
      {config.label}
    </Badge>
  )

  if (safeStatus !== 'DIRTY' || issuesList.length === 0) {
    return trigger
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block cursor-help">{trigger}</span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium text-xs">Brakujące wymagane atrybuty:</p>
            <ul className="text-xs">
              {issuesList.map((i, idx) => (
                <li key={`${i.key}-${idx}`} className="font-mono">
                  • {i.key}
                </li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
