'use client'

// app/intelligence/cohorts/[id]/_components/cohort-bulk-bar.tsx
// Phase 2 Krok 1.D1 — sticky bulk action bar для cohort detail page.
// Light theme (match cohort detail style — NIE dark як на /clients).
//
// Visible коли selected.size > 0. Layout:
//   [Wybrano: N] | Zmień status na: [Select 5 statuses] | [Wyczyść]

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  bulkUpdateCohortMemberStatus,
  type CohortMemberStatus,
  type MemberKey,
} from '@/lib/actions/cohorts'

const STATUS_OPTIONS: { value: CohortMemberStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'called', label: 'Zadzwoniono' },
  { value: 'interested', label: 'Zainteresowani' },
  { value: 'not_interested', label: 'Nie zainteresowani' },
  { value: 'callback', label: 'Callback' },
]

interface Props {
  cohortId: string
  memberKeys: MemberKey[]
  onClear: () => void
}

export function CohortBulkBar({ cohortId, memberKeys, onClear }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Reset key для Select — після успішного bulk update Select показує
  // placeholder знов (NIE locked на last value).
  const [selectKey, setSelectKey] = useState(0)

  const n = memberKeys.length

  const handleStatusChange = (status: string) => {
    if (!status) return
    startTransition(async () => {
      try {
        const res = await bulkUpdateCohortMemberStatus(
          memberKeys,
          status as CohortMemberStatus,
        )
        const statusLabel =
          STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
        toast.success(`${res.updated} członków → ${statusLabel}`)
        onClear()
        setSelectKey((k) => k + 1)
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.error(`Błąd: ${msg}`)
      }
    })
  }

  return (
    <div className="sticky bottom-0 z-10 -mx-1 mt-3 flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <span className="text-sm font-medium">
        Wybrano: <span className="tabular-nums">{n}</span>
      </span>

      <Separator orientation="vertical" className="h-6" />

      <span className="text-sm text-muted-foreground">Zmień status na:</span>
      <Select
        key={selectKey}
        onValueChange={handleStatusChange}
        disabled={pending}
      >
        <SelectTrigger size="sm" className="h-8 w-[200px]">
          <SelectValue
            placeholder={pending ? 'Aktualizacja…' : 'Wybierz status…'}
          />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="h-6" />

      <Button
        variant="link"
        size="sm"
        onClick={onClear}
        disabled={pending}
        className="ml-auto h-auto p-0 text-xs text-muted-foreground"
      >
        Wyczyść zaznaczenie
      </Button>
    </div>
  )
}
