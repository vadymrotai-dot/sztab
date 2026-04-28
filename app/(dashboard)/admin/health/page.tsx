// app/(dashboard)/admin/health/page.tsx
// Sprint G — admin observability dashboard.
// Show last 5 runs per cron job + red signal якщо stale > 8 days або status=error.

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2Icon, AlertTriangleIcon, Loader2Icon, ClockIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STALE_THRESHOLD_MS = 8 * 24 * 60 * 60 * 1000

interface CronRun {
  id: string
  job_name: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'success' | 'error'
  pairs_processed: number | null
  duration_ms: number | null
  error_message: string | null
  meta: Record<string, unknown> | null
}

export default async function AdminHealthPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cron_runs')
    .select('id, job_name, started_at, finished_at, status, pairs_processed, duration_ms, error_message, meta')
    .order('started_at', { ascending: false })
    .limit(50)

  const rows = (data ?? []) as CronRun[]
  const grouped = new Map<string, CronRun[]>()
  for (const r of rows) {
    const arr = grouped.get(r.job_name) ?? []
    arr.push(r)
    grouped.set(r.job_name, arr)
  }
  const knownJobs = ['matching-refresh', 'hygiene-scan']
  for (const j of knownJobs) {
    if (!grouped.has(j)) grouped.set(j, [])
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Admin / Health"
        breadcrumbs={[{ label: 'Admin', href: '/admin/health' }, { label: 'Health' }]}
      />
      <div className="flex flex-1 flex-col gap-4 p-6">
        {error && (
          <Card>
            <CardContent className="p-4 text-sm text-red-600">
              DB error: {error.message}
            </CardContent>
          </Card>
        )}

        {Array.from(grouped.entries()).map(([jobName, runs]) => {
          const latest = runs[0]
          const stale =
            !latest ||
            Date.now() - new Date(latest.started_at).getTime() > STALE_THRESHOLD_MS
          const failing = latest?.status === 'error'
          const cardColor = failing
            ? 'border-red-300 bg-red-50/30'
            : stale
              ? 'border-amber-300 bg-amber-50/30'
              : 'border-green-300 bg-green-50/30'

          return (
            <Card key={jobName} className={cardColor}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  {failing ? (
                    <AlertTriangleIcon className="size-5 text-red-600" />
                  ) : stale ? (
                    <ClockIcon className="size-5 text-amber-600" />
                  ) : (
                    <CheckCircle2Icon className="size-5 text-green-600" />
                  )}
                  <span className="font-mono">{jobName}</span>
                </CardTitle>
                <div className="text-xs text-muted-foreground">
                  {latest
                    ? `Last: ${new Date(latest.started_at).toLocaleString('pl-PL')}`
                    : 'No runs yet'}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Brak nagrań runs (cron może jeszcze nie zaplanowany lub nie uruchomiony).
                  </p>
                ) : (
                  <ul className="divide-y text-xs">
                    {runs.slice(0, 5).map((r) => (
                      <RunRow key={r.id} run={r} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function RunRow({ run }: { run: CronRun }) {
  const start = new Date(run.started_at)
  const durationStr = run.duration_ms
    ? `${(run.duration_ms / 1000).toFixed(1)}s`
    : run.status === 'running'
      ? 'running…'
      : '—'
  const statusBadge =
    run.status === 'success' ? (
      <Badge className="bg-green-600 text-white">success</Badge>
    ) : run.status === 'error' ? (
      <Badge className="bg-red-600 text-white">error</Badge>
    ) : (
      <Badge className="bg-amber-500 text-white">
        <Loader2Icon className="size-3 mr-1 animate-spin" />
        running
      </Badge>
    )

  return (
    <li className="grid grid-cols-12 items-start gap-2 py-1.5">
      <div className="col-span-3 font-mono text-muted-foreground">
        {start.toLocaleString('pl-PL')}
      </div>
      <div className="col-span-2">{statusBadge}</div>
      <div className="col-span-2 font-mono">
        {run.pairs_processed !== null ? `${run.pairs_processed} items` : '—'}
      </div>
      <div className="col-span-2 font-mono">{durationStr}</div>
      <div className="col-span-3 truncate text-muted-foreground" title={run.error_message ?? undefined}>
        {run.error_message ?? (run.meta ? JSON.stringify(run.meta).slice(0, 60) : '')}
      </div>
    </li>
  )
}
