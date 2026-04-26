'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  Loader2Icon,
  SparklesIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { FastLookupResult } from '@/lib/ai/intelligence'
import type { IntelligenceRunSummary } from '@/app/actions/intelligence'
import { IntelligenceResultsView } from './intelligence-results-view'

interface IntelligenceDashboardClientProps {
  runs: IntelligenceRunSummary[]
}

const statusBadge: Record<
  IntelligenceRunSummary['status'],
  { className: string; label: string; icon: React.ElementType }
> = {
  pending: {
    className: 'bg-slate-100 text-slate-700 border-transparent',
    label: 'Pending',
    icon: ClockIcon,
  },
  running: {
    className: 'bg-blue-100 text-blue-700 border-transparent',
    label: 'Running',
    icon: Loader2Icon,
  },
  completed: {
    className: 'bg-green-100 text-green-700 border-transparent',
    label: 'Completed',
    icon: CheckCircle2Icon,
  },
  failed: {
    className: 'bg-red-100 text-red-700 border-transparent',
    label: 'Failed',
    icon: AlertCircleIcon,
  },
}

const targetTypeLabel: Record<IntelligenceRunSummary['target_type'], string> = {
  product: 'Produkt',
  category: 'Kategoria',
  supplier: 'Dostawca',
  client: 'Klient',
}

const runTypeLabel: Record<IntelligenceRunSummary['run_type'], string> = {
  fast_lookup: 'Fast Lookup',
  deep_discovery: 'Deep Discovery',
  partner_analysis: 'Partner Analysis',
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function targetName(run: IntelligenceRunSummary): string {
  const snap = run.target_snapshot as { name?: string; title?: string } | null
  return snap?.name ?? snap?.title ?? `${run.target_type} ${run.target_id.slice(0, 8)}`
}

function targetHref(run: IntelligenceRunSummary): string | null {
  if (run.target_type === 'product') return `/products/${run.target_id}/edit`
  if (run.target_type === 'client') return `/clients/${run.target_id}`
  if (run.target_type === 'supplier') return `/suppliers/${run.target_id}`
  return null
}

export function IntelligenceDashboardClient({
  runs,
}: IntelligenceDashboardClientProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <SparklesIcon className="size-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Brak analiz</p>
            <p className="text-sm text-muted-foreground">
              Otwórz produkt na{' '}
              <Link className="underline" href="/products">
                /products
              </Link>{' '}
              i kliknij „Znajdź potencjalnych klientów".
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]"></TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Typ analizy</TableHead>
            <TableHead>Cel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Wyniki</TableHead>
            <TableHead className="text-right">Czas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => {
            const isExpanded = expandedId === run.id
            const isExpandable =
              run.status === 'completed' && run.parsed_results != null
            const status = statusBadge[run.status]
            const StatusIcon = status.icon
            const href = targetHref(run)
            return (
              <Fragment key={run.id}>
                <TableRow
                  className={cn(
                    isExpandable && 'cursor-pointer hover:bg-muted/40',
                  )}
                  onClick={() => isExpandable && toggle(run.id)}
                >
                  <TableCell>
                    {isExpandable ? (
                      isExpanded ? (
                        <ChevronDownIcon className="size-4" />
                      ) : (
                        <ChevronRightIcon className="size-4" />
                      )
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {new Date(run.created_at).toLocaleString('pl-PL', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">
                      {runTypeLabel[run.run_type]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {targetTypeLabel[run.target_type]}
                      </span>
                      {href ? (
                        <Link
                          href={href}
                          className="text-sm font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {targetName(run)}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium">
                          {targetName(run)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(status.className, 'gap-1')}
                    >
                      <StatusIcon
                        className={cn(
                          'size-3',
                          run.status === 'running' && 'animate-spin',
                        )}
                      />
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {run.results_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(run.duration_ms)}
                  </TableCell>
                </TableRow>
                {isExpanded && run.parsed_results && (
                  <TableRow className="bg-muted/20">
                    <TableCell colSpan={7} className="p-4">
                      <IntelligenceResultsView
                        result={run.parsed_results as FastLookupResult}
                      />
                    </TableCell>
                  </TableRow>
                )}
                {run.status === 'failed' && run.error_message && (
                  <TableRow className="bg-red-50/50 dark:bg-red-950/20">
                    <TableCell colSpan={7} className="p-3 text-sm text-red-700">
                      <strong>Error:</strong> {run.error_message}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
