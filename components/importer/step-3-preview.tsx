'use client'

import { useMemo, useState } from 'react'
import { AlertCircleIcon, CheckCircle2Icon, InfoIcon } from 'lucide-react'

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  CanonicalField,
  ParsedRow,
  ValidationIssue,
} from '@/lib/importers/types'
import type { ImportedProductDraft } from '@/lib/importers/supplier-price-list'

interface StepPreviewProps {
  rows: ParsedRow<ImportedProductDraft>[]
  canonicalSchema: CanonicalField[]
  updateExisting: boolean
  onUpdateExistingChange: (v: boolean) => void
}

type FilterMode = 'all' | 'errors' | 'warnings' | 'duplicates'

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-green-100 text-green-800 border-transparent',
  duplicate: 'bg-amber-100 text-amber-800 border-transparent',
  invalid: 'bg-red-100 text-red-800 border-transparent',
}
const STATUS_LABEL: Record<string, string> = {
  new: 'Nowy',
  duplicate: 'Duplikat',
  invalid: 'Błąd',
}

const formatVal = (v: unknown): string => {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? '✓' : '—'
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'number')
    return Number.isInteger(v) ? v.toString() : v.toFixed(2)
  return String(v)
}

export function StepPreview({
  rows,
  canonicalSchema,
  updateExisting,
  onUpdateExistingChange,
}: StepPreviewProps) {
  const [filter, setFilter] = useState<FilterMode>('all')

  const stats = useMemo(() => {
    let neu = 0
    let dup = 0
    let invalid = 0
    let warns = 0
    for (const r of rows) {
      if (r.status === 'new') neu++
      else if (r.status === 'duplicate') dup++
      else if (r.status === 'invalid') invalid++
      if (
        r.status !== 'invalid' &&
        r.issues.some((i) => i.severity === 'warning')
      )
        warns++
    }
    return { neu, dup, invalid, warns, total: rows.length }
  }, [rows])

  const filtered = useMemo(() => {
    switch (filter) {
      case 'errors':
        return rows.filter((r) => r.status === 'invalid')
      case 'warnings':
        return rows.filter(
          (r) =>
            r.status !== 'invalid' &&
            r.issues.some((i) => i.severity === 'warning'),
        )
      case 'duplicates':
        return rows.filter((r) => r.status === 'duplicate')
      default:
        return rows
    }
  }, [rows, filter])

  const visible = filtered.slice(0, 100) // cap render — full list available in DB after commit

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile color="green" label="Nowych" value={stats.neu} />
        <StatTile color="amber" label="Duplikatów" value={stats.dup} />
        <StatTile color="red" label="Błędów" value={stats.invalid} />
        <StatTile color="slate" label="Ostrzeżeń" value={stats.warns} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          {(['all', 'errors', 'warnings', 'duplicates'] as FilterMode[]).map(
            (m) => (
              <Button
                key={m}
                type="button"
                variant={filter === m ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(m)}
              >
                {m === 'all' && 'Wszystkie'}
                {m === 'errors' && `Błędy (${stats.invalid})`}
                {m === 'warnings' && `Ostrzeżenia (${stats.warns})`}
                {m === 'duplicates' && `Duplikaty (${stats.dup})`}
              </Button>
            ),
          )}
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="update_existing" className="text-sm">
            Oświeżać ceny istniejących SKU
          </Label>
          <Switch
            id="update_existing"
            checked={updateExisting}
            onCheckedChange={onUpdateExistingChange}
          />
        </div>
      </div>

      <div className="rounded-md border max-h-[500px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              {canonicalSchema.map((f) => (
                <TableHead key={f.field}>{f.label}</TableHead>
              ))}
              <TableHead className="w-[60px]">⚠</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canonicalSchema.length + 3}
                  className="text-center text-sm text-muted-foreground py-12"
                >
                  Brak wierszy spełniających filtr.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => (
                <TableRow
                  key={r.rowIndex}
                  className={cn(
                    r.status === 'invalid' && 'bg-destructive/5',
                    r.status === 'duplicate' && 'bg-amber-50/30',
                  )}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.rowIndex}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', STATUS_BADGE[r.status])}
                    >
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </TableCell>
                  {canonicalSchema.map((f) => {
                    const fieldIssues = r.issues.filter(
                      (i) => i.field === f.field,
                    )
                    const value = (r.parsed as Record<string, unknown>)[
                      f.field
                    ]
                    return (
                      <TableCell
                        key={f.field}
                        className={cn(
                          'text-sm align-top',
                          fieldIssues.some((i) => i.severity === 'error') &&
                            'text-destructive',
                          fieldIssues.some((i) => i.severity === 'warning') &&
                            'text-amber-600',
                        )}
                      >
                        {formatVal(value)}
                      </TableCell>
                    )
                  })}
                  <TableCell>
                    {r.issues.length > 0 && (
                      <IssueIcon issues={r.issues} />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {filtered.length > visible.length && (
        <p className="text-xs text-muted-foreground">
          Pokazano pierwsze {visible.length} z {filtered.length} wierszy.
          Wszystkie zostaną zaimportowane po potwierdzeniu.
        </p>
      )}
    </div>
  )
}

function StatTile({
  color,
  label,
  value,
}: {
  color: 'green' | 'amber' | 'red' | 'slate'
  label: string
  value: number
}) {
  const cls = {
    green: 'bg-green-50 text-green-800',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-800',
    slate: 'bg-slate-50 text-slate-700',
  }[color]
  return (
    <div className={cn('rounded-md border p-3', cls)}>
      <p className="text-xs">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function IssueIcon({ issues }: { issues: ValidationIssue[] }) {
  const hasError = issues.some((i) => i.severity === 'error')
  const hasWarning = issues.some((i) => i.severity === 'warning')
  if (hasError)
    return (
      <span title={issues.map((i) => i.message).join('; ')}>
        <AlertCircleIcon className="size-4 text-destructive" />
      </span>
    )
  if (hasWarning)
    return (
      <span title={issues.map((i) => i.message).join('; ')}>
        <InfoIcon className="size-4 text-amber-600" />
      </span>
    )
  return <CheckCircle2Icon className="size-4 text-green-600" />
}
