'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  FilterIcon,
  Loader2Icon,
  MailIcon,
  PhoneIcon,
  SparklesIcon,
  TrashIcon,
  UserPlusIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  exportEntityToClient,
  startDeepDiscoveryForProduct,
  updateDiscoveredEntityStatus,
  type DiscoveredEntityRow,
} from '@/app/actions/intelligence'

interface DeepDiscoveryResultsProps {
  productId: string
  productName: string
  entities: DiscoveredEntityRow[]
  runStatus: 'pending' | 'running' | 'completed' | 'failed' | null
  runWarnings: string[]
  runDate: string | null
  durationMs: number | null
}

type StatusFilter = 'all' | 'new' | 'reviewed' | 'exported' | 'rejected'

const statusBadge: Record<
  DiscoveredEntityRow['status'],
  { className: string; label: string }
> = {
  new: { className: 'bg-blue-100 text-blue-700 border-transparent', label: 'Nowy' },
  reviewed: {
    className: 'bg-amber-100 text-amber-700 border-transparent',
    label: 'Przejrzany',
  },
  exported: {
    className: 'bg-green-100 text-green-700 border-transparent',
    label: 'Eksportowany',
  },
  rejected: {
    className: 'bg-red-100 text-red-700 border-transparent',
    label: 'Odrzucony',
  },
}

const sourceLabel: Record<DiscoveredEntityRow['source'], string> = {
  aleo: 'Aleo',
  panorama_firm: 'Panorama Firm',
  gemini_search: 'Gemini',
  krs_rejestr: 'KRS',
  // 'manual' is in DB but not produced by pipeline
}

function fitScoreClass(s: number): string {
  if (s >= 75) return 'bg-green-100 text-green-800 border-transparent'
  if (s >= 50) return 'bg-amber-100 text-amber-800 border-transparent'
  return 'bg-red-100 text-red-800 border-transparent'
}

export function DeepDiscoveryResults({
  productId,
  productName,
  entities: initialEntities,
  runStatus,
  runWarnings,
  runDate,
  durationMs,
}: DeepDiscoveryResultsProps) {
  const router = useRouter()
  const [entities, setEntities] = useState(initialEntities)
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pitchEntity, setPitchEntity] =
    useState<DiscoveredEntityRow | null>(null)
  const [confirmRunOpen, setConfirmRunOpen] = useState(false)

  const [segmentFilter, setSegmentFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [minFit, setMinFit] = useState<string>('0')

  const segmentOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of entities) if (e.segment_name) set.add(e.segment_name)
    return Array.from(set).sort()
  }, [entities])

  const filtered = useMemo(() => {
    const min = Number.parseFloat(minFit) || 0
    return entities.filter((e) => {
      if (segmentFilter !== 'all' && e.segment_name !== segmentFilter)
        return false
      if (sourceFilter !== 'all' && e.source !== sourceFilter) return false
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      if (e.fit_score < min) return false
      return true
    })
  }, [entities, segmentFilter, sourceFilter, statusFilter, minFit])

  const stats = useMemo(() => {
    const total = entities.length
    const verified = entities.filter((e) => e.nip_verified).length
    const avgFit = total
      ? Math.round(
          entities.reduce((s, e) => s + e.fit_score, 0) / total,
        )
      : 0
    return { total, verified, avgFit }
  }, [entities])

  const allSelected =
    filtered.length > 0 && filtered.every((e) => selected.has(e.id))

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const e of filtered) next.delete(e.id)
      } else {
        for (const e of filtered) next.add(e.id)
      }
      return next
    })
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRun = () => {
    setConfirmRunOpen(false)
    startTransition(async () => {
      try {
        const out = await startDeepDiscoveryForProduct(productId)
        toast.success(
          `Deep Discovery zakończone — ${out.entities_count} firm, ${out.verified_count} z verified NIP`,
        )
        router.refresh()
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Deep Discovery nieudany',
        )
      }
    })
  }

  const handleExport = (entityId: string) => {
    startTransition(async () => {
      try {
        const out = await exportEntityToClient(entityId)
        setEntities((prev) =>
          prev.map((e) =>
            e.id === entityId
              ? {
                  ...e,
                  status: 'exported',
                  imported_to_clients_id: out.clientId,
                }
              : e,
          ),
        )
        toast.success(
          out.alreadyExisted
            ? 'Klient już istniał — encja oznaczona jako exported'
            : 'Klient utworzony',
        )
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Eksport nieudany',
        )
      }
    })
  }

  const handleBulkExport = () => {
    if (selected.size === 0) return
    startTransition(async () => {
      let ok = 0
      let already = 0
      let fail = 0
      for (const id of selected) {
        try {
          const out = await exportEntityToClient(id)
          if (out.alreadyExisted) already += 1
          else ok += 1
          setEntities((prev) =>
            prev.map((e) =>
              e.id === id
                ? {
                    ...e,
                    status: 'exported',
                    imported_to_clients_id: out.clientId,
                  }
                : e,
            ),
          )
        } catch {
          fail += 1
        }
      }
      setSelected(new Set())
      toast.success(
        `Eksport: ${ok} nowych, ${already} już istniało${fail ? `, ${fail} błędów` : ''}`,
      )
    })
  }

  const handleBulkReject = () => {
    if (selected.size === 0) return
    startTransition(async () => {
      for (const id of selected) {
        await updateDiscoveredEntityStatus(id, 'rejected')
      }
      setEntities((prev) =>
        prev.map((e) =>
          selected.has(e.id) ? { ...e, status: 'rejected' } : e,
        ),
      )
      setSelected(new Set())
      toast.success(`Odrzucono ${selected.size} pozycji`)
    })
  }

  const isRunning = runStatus === 'running' || isPending

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{productName}</h2>
          {runDate && (
            <p className="text-xs text-muted-foreground">
              Ostatni run:{' '}
              {new Date(runDate).toLocaleString('pl-PL', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: 'Europe/Warsaw',
              })}
              {durationMs != null && ` · ${(durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
        </div>
        <Button
          onClick={() => setConfirmRunOpen(true)}
          disabled={isRunning}
        >
          {isRunning ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              Trwa analiza... (~3-5 min)
            </>
          ) : (
            <>
              <SparklesIcon className="mr-2 size-4" />
              {entities.length > 0
                ? 'Uruchom ponownie'
                : 'Rozpocznij Deep Discovery'}
            </>
          )}
        </Button>
      </div>

      {runStatus === 'failed' && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircleIcon className="size-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">
                Ostatni run nieudany
              </p>
              <p className="text-sm text-red-700">
                Sprawdź logi Vercel lub uruchom ponownie. Najczęściej to
                missing API token w Ustawieniach lub Apify actor ID
                wymaga weryfikacji.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {entities.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Łącznie firm</p>
              <p className="text-2xl font-semibold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">NIP verified</p>
              <p className="text-2xl font-semibold">
                {stats.verified}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({stats.total ? Math.round((stats.verified / stats.total) * 100) : 0}%)
                </span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Średni fit_score</p>
              <p className="text-2xl font-semibold">{stats.avgFit}/100</p>
            </CardContent>
          </Card>
        </div>
      )}

      {runWarnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 text-xs text-amber-900">
            <p className="font-medium mb-1">
              <FilterIcon className="inline size-3 mr-1" />
              Pipeline warnings ({runWarnings.length}):
            </p>
            <ul className="space-y-0.5">
              {runWarnings.slice(0, 5).map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
              {runWarnings.length > 5 && (
                <li className="italic">...i {runWarnings.length - 5} więcej</li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {entities.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <span className="text-muted-foreground">Filtr:</span>
            <Select value={segmentFilter} onValueChange={setSegmentFilter}>
              <SelectTrigger className="h-8 w-[200px]">
                <SelectValue placeholder="Segment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie segmenty</SelectItem>
                {segmentOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue placeholder="Źródło" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie źródła</SelectItem>
                <SelectItem value="panorama_firm">Panorama Firm</SelectItem>
                <SelectItem value="aleo">Aleo</SelectItem>
                <SelectItem value="gemini_search">Gemini</SelectItem>
                <SelectItem value="krs_rejestr">KRS</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie</SelectItem>
                <SelectItem value="new">Nowy</SelectItem>
                <SelectItem value="reviewed">Przejrzany</SelectItem>
                <SelectItem value="exported">Eksportowany</SelectItem>
                <SelectItem value="rejected">Odrzucony</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Min fit:</span>
              <Input
                type="number"
                min="0"
                max="100"
                value={minFit}
                onChange={(e) => setMinFit(e.target.value)}
                className="h-8 w-[70px]"
              />
            </div>
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} / {entities.length}
            </span>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
              <span className="font-medium text-blue-900">
                {selected.size} zaznaczone
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkExport}
                disabled={isPending}
              >
                <UserPlusIcon className="mr-1 size-3" />
                Eksportuj do /clients
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkReject}
                disabled={isPending}
              >
                <TrashIcon className="mr-1 size-3" />
                Odrzuć
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Wyczyść
              </Button>
            </div>
          )}

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30px]">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="size-4"
                    />
                  </TableHead>
                  <TableHead>Nazwa / Segment</TableHead>
                  <TableHead>NIP / KRS</TableHead>
                  <TableHead>Lokalizacja</TableHead>
                  <TableHead>Branża</TableHead>
                  <TableHead className="text-right">Fit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        onChange={() => toggleOne(e.id)}
                        className="size-4"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.segment_name}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        {e.email && (
                          <a
                            href={`mailto:${e.email}`}
                            className="flex items-center gap-1 hover:underline"
                          >
                            <MailIcon className="size-3" />
                            {e.email}
                          </a>
                        )}
                        {e.phone && (
                          <a
                            href={`tel:${e.phone}`}
                            className="flex items-center gap-1 hover:underline"
                          >
                            <PhoneIcon className="size-3" />
                            {e.phone}
                          </a>
                        )}
                        {e.website && (
                          <a
                            href={e.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:underline"
                          >
                            <ExternalLinkIcon className="size-3" />
                            web
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      <div className="flex items-center gap-1">
                        {e.nip ?? '—'}
                        {e.nip_verified && (
                          <CheckCircle2Icon
                            className="size-3 text-green-600"
                            aria-label="NIP verified"
                          />
                        )}
                      </div>
                      {e.krs && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          KRS: {e.krs}
                          {e.krs_verified && (
                            <CheckCircle2Icon className="size-3 text-green-600" />
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{e.city ?? '—'}</div>
                      {e.region && (
                        <div className="text-xs text-muted-foreground">
                          {e.region}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      <span className="text-sm line-clamp-2">
                        {e.branza ?? '—'}
                      </span>
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {sourceLabel[e.source] ?? e.source}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={cn('tabular-nums', fitScoreClass(e.fit_score))}
                      >
                        {e.fit_score}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusBadge[e.status].className}
                      >
                        {statusBadge[e.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {e.outreach_pitch && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => setPitchEntity(e)}
                            title="Pitch"
                          >
                            <SparklesIcon className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          disabled={isPending || e.status === 'exported'}
                          onClick={() => handleExport(e.id)}
                          title="Eksportuj do /clients"
                        >
                          <UserPlusIcon className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AlertDialog open={confirmRunOpen} onOpenChange={setConfirmRunOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uruchomić Deep Discovery?</AlertDialogTitle>
            <AlertDialogDescription>
              Pipeline trwa ~3-5 minut: Gemini segmentacja → Apify scraping
              (Panorama Firm) → KRS Rejestr.io weryfikacja → Gemini ranking.
              Wyniki nadpisują istniejące encje (ten sam NIP nie jest
              duplikowany — partial unique index).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleRun}>Uruchom</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={pitchEntity != null}
        onOpenChange={(o) => !o && setPitchEntity(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pitchEntity?.name}</DialogTitle>
            <DialogDescription>
              Outreach approach + pitch wygenerowany przez Gemini
            </DialogDescription>
          </DialogHeader>
          {pitchEntity && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium mb-1">Approach</p>
                <p className="text-muted-foreground">
                  {pitchEntity.outreach_approach ?? '—'}
                </p>
              </div>
              <div>
                <p className="font-medium mb-1">Pitch</p>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {pitchEntity.outreach_pitch ?? '—'}
                </p>
              </div>
              {pitchEntity.email && (
                <div className="text-xs">
                  Email: <span className="font-mono">{pitchEntity.email}</span>
                </div>
              )}
              {pitchEntity.phone && (
                <div className="text-xs">
                  Telefon: <span className="font-mono">{pitchEntity.phone}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPitchEntity(null)}>
              Zamknij
            </Button>
            {pitchEntity && pitchEntity.status !== 'exported' && (
              <Button
                onClick={() => {
                  handleExport(pitchEntity.id)
                  setPitchEntity(null)
                }}
                disabled={isPending}
              >
                <UserPlusIcon className="mr-2 size-4" />
                Eksportuj do /clients
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
