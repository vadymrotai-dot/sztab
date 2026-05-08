'use client'

// components/clients/bulk-action-bar.tsx
// Sprint S4 Phase 2B — sticky dark bulk action bar для /clients.
// Phase 2 Krok 1.C2 (08.05.2026) — додано 5-та action "Dodaj do cohort"
// (parallel до prospects flow). Coexists з legacy "Eksport jako kohorta"
// (handoff system) per Vadym Q2=B decision.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  SparklesIcon,
  BriefcaseIcon,
  RefreshCcwIcon,
  TagIcon,
  XIcon,
  Loader2Icon,
  PlusIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { addClientsToCohort, createCohort } from '@/lib/actions/cohorts'

const NAME_MAX = 100
const DESC_MAX = 500

export interface CohortOption {
  id: string
  name: string
  member_count: number
}

interface Props {
  /** All selected row IDs (mixed entity_type у unified clients table). */
  selectedIds: string[]
  /** Subset filtered to entity_type='client' тільки — used для cohort UI.
   *  Krok 1.C2 Q4 decision: entity_type='prospect' rows не ходять через
   *  addClientsToCohort (вони CEIDG-derived, окремий flow). */
  clientTypedSelectedIds: string[]
  /** Cohorts dropdown — server-fetched у parent (clients-hub via page.tsx). */
  cohorts: CohortOption[]
  onClear: () => void
}

export function BulkActionBar({
  selectedIds,
  clientTypedSelectedIds,
  cohorts,
  onClear,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<
    'analyze' | 'cohort' | 'refresh' | 'tag' | 'add-cohort' | null
  >(null)
  const [cohortPending, startCohortTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newError, setNewError] = useState<string | null>(null)

  const n = selectedIds.length
  const cohortEligibleN = clientTypedSelectedIds.length

  async function bulkAnalyze() {
    if (
      !confirm(
        `Analizuj AI dla ${n} firm? Operacja zsekwencyjna, ~30-60s na firmę. Cap 5 за wykonanie.`,
      )
    )
      return
    setBusy('analyze')
    try {
      const res = await fetch('/api/clients/bulk-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const json = (await res.json()) as {
        ok: boolean
        succeeded?: number
        failed?: number
        error?: string
      }
      if (json.ok) {
        alert(
          `Analiza zakończona: ${json.succeeded ?? 0} OK, ${json.failed ?? 0} błędów.${
            n > 5 ? ` (Cap 5 — ${n - 5} pominiętych)` : ''
          }`,
        )
        router.refresh()
        onClear()
      } else {
        alert(json.error ?? 'Błąd bulk-analyze')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  async function exportCohort() {
    const name = prompt(
      `Eksport ${n} firm jako kohorta. Podaj nazwę:`,
      `Manualna kohorta ${new Date().toISOString().slice(0, 10)}`,
    )
    if (!name) return
    setBusy('cohort')
    try {
      const res = await fetch('/api/handoff/cohort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohort_name: name,
          entity_ids: selectedIds,
          source: 'manual_select',
        }),
      })
      const json = (await res.json()) as { ok: boolean; redirect?: string; error?: string }
      if (json.ok && json.redirect) {
        router.push(json.redirect)
        onClear()
      } else {
        alert(json.error ?? 'Błąd eksportu')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  async function bulkRefresh() {
    if (!confirm(`Odświeżyć z KRS dla ${n} firm? (Cap 5 за wykonanie)`)) return
    setBusy('refresh')
    try {
      const res = await fetch('/api/clients/bulk-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const json = (await res.json()) as {
        ok: boolean
        succeeded?: number
        failed?: number
        skipped?: number
        error?: string
      }
      if (json.ok) {
        alert(
          `Odświeżanie: ${json.succeeded ?? 0} OK, ${json.failed ?? 0} błędów, ${
            json.skipped ?? 0
          } pominiętych.`,
        )
        router.refresh()
        onClear()
      } else {
        alert(json.error ?? 'Błąd bulk-refresh')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  async function bulkTag() {
    const value = prompt('Tier для wybranych firm (mały/średni/duży/strategic_partner):')
    if (!value) return
    setBusy('tag')
    try {
      const res = await fetch('/api/clients/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, field: 'size_tier', value }),
      })
      const json = (await res.json()) as { ok: boolean; updated?: number; error?: string }
      if (json.ok) {
        alert(`Otagowano ${json.updated ?? n} firm`)
        router.refresh()
        onClear()
      } else {
        alert(json.error ?? 'Błąd tagowania')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  // ─── Krok 1.C2: cohort actions (sonner toast pattern) ──────────

  const handleAddToCohort = (cohortId: string) => {
    if (!cohortId) return
    if (cohortEligibleN === 0) {
      toast.error('Brak klientów do dodania (zaznaczone tylko prospekti).')
      return
    }
    const cohort = cohorts.find((c) => c.id === cohortId)
    const cohortName = cohort?.name ?? cohortId.slice(0, 8)
    setBusy('add-cohort')
    startCohortTransition(async () => {
      try {
        const res = await addClientsToCohort(cohortId, clientTypedSelectedIds)
        if (res.added > 0 && res.skipped > 0) {
          toast.success(
            `${res.added} dodano, ${res.skipped} już było w "${cohortName}"`,
          )
        } else if (res.added > 0) {
          toast.success(`${res.added} klientów dodano do "${cohortName}"`)
        } else {
          toast.info(`Wszystkie ${res.skipped} już są w "${cohortName}"`)
        }
        onClear()
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.error(`Błąd: ${msg}`)
      } finally {
        setBusy(null)
      }
    })
  }

  const handleCreateAndAddCohort = () => {
    const trimmed = newName.trim()
    if (!trimmed) {
      setNewError('Nazwa wymagana')
      return
    }
    if (trimmed.length > NAME_MAX) {
      setNewError(`Max ${NAME_MAX} znaków`)
      return
    }
    if (newDescription.length > DESC_MAX) {
      setNewError(`Opis max ${DESC_MAX} znaków`)
      return
    }
    setNewError(null)

    startCohortTransition(async () => {
      try {
        const created = await createCohort(
          trimmed,
          newDescription.trim() || undefined,
        )
        const res = await addClientsToCohort(
          created.id,
          clientTypedSelectedIds,
        )
        toast.success(
          `Cohort "${created.name}" utworzony — ${res.added} klientów dodano`,
        )
        setDialogOpen(false)
        setNewName('')
        setNewDescription('')
        onClear()
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        setNewError(msg)
        toast.error(`Błąd: ${msg}`)
      }
    })
  }

  const cohortBusy = busy === 'add-cohort' || cohortPending

  return (
    <>
      <div className="sticky bottom-0 left-0 right-0 z-30 border-t border-[#0A0A0A] bg-[#15151A] text-white shadow-[0_-4px_12px_rgba(0,0,0,0.15)]">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <span className="text-sm font-medium">
            Wybrano <span className="text-[#A5B4FC]">{n}</span> firm
          </span>
          <div className="ml-2 h-6 w-px bg-white/15" />

          <button
            type="button"
            onClick={bulkAnalyze}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#4F46E5] px-3 py-1.5 text-sm font-medium hover:bg-[#4338CA] disabled:opacity-50"
          >
            {busy === 'analyze' ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="size-3.5" />
            )}
            Analizuj AI ({n})
          </button>

          <button
            type="button"
            onClick={exportCohort}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            {busy === 'cohort' ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <BriefcaseIcon className="size-3.5" />
            )}
            Eksport jako kohorta
          </button>

          <button
            type="button"
            onClick={bulkRefresh}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            {busy === 'refresh' ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <RefreshCcwIcon className="size-3.5" />
            )}
            Odśwież z KRS
          </button>

          <button
            type="button"
            onClick={bulkTag}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            {busy === 'tag' ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <TagIcon className="size-3.5" />
            )}
            + Tag
          </button>

          {/* Phase 2 Krok 1.C2 — Sztab cohort dropdown (parallel system,
              coexists з legacy "Eksport jako kohorta" above per Q2=B). */}
          <div className="ml-2 h-6 w-px bg-white/15" />

          <span className="text-sm text-white/70">Dodaj do cohort:</span>
          <Select
            onValueChange={handleAddToCohort}
            value=""
            disabled={busy !== null || cohortBusy || cohortEligibleN === 0}
          >
            <SelectTrigger
              size="sm"
              className="h-8 w-[200px] border-white/20 bg-transparent text-white hover:bg-white/10 data-[placeholder]:text-white/60 [&_svg]:text-white/60"
            >
              <SelectValue
                placeholder={
                  cohorts.length === 0
                    ? 'Brak cohortów'
                    : cohortEligibleN === 0
                      ? 'Brak klientów'
                      : cohortBusy
                        ? 'Dodawanie…'
                        : `Wybierz cohort… (${cohortEligibleN})`
                }
              />
            </SelectTrigger>
            <SelectContent>
              {cohorts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}{' '}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({c.member_count})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            disabled={busy !== null || cohortBusy || cohortEligibleN === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            <PlusIcon className="size-3.5" />
            Nowa cohort
          </button>

          <button
            type="button"
            onClick={onClear}
            disabled={busy !== null || cohortBusy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <XIcon className="size-3.5" />
            Anuluj
          </button>
        </div>
      </div>

      {/* + Nowa cohort dialog (Krok 1.C2) */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => !cohortPending && setDialogOpen(v)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nowa cohort</DialogTitle>
            <DialogDescription>
              Po utworzeniu, {cohortEligibleN}{' '}
              {cohortEligibleN === 1
                ? 'wybrany klient'
                : 'wybranych klientów'}{' '}
              zostanie automatycznie dodany do nowej cohortу.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-cohort-name-clients">
                Nazwa <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-cohort-name-clients"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="np. CzM-12-05 — Czudowа Marka"
                maxLength={NAME_MAX}
                disabled={cohortPending}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {newName.length} / {NAME_MAX}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-cohort-description-clients">
                Opis (opcjonalnie)
              </Label>
              <Textarea
                id="new-cohort-description-clients"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Kontekst, cel obzwonu…"
                rows={2}
                maxLength={DESC_MAX}
                disabled={cohortPending}
              />
              <p className="text-xs text-muted-foreground">
                {newDescription.length} / {DESC_MAX}
              </p>
            </div>

            {newError && (
              <p className="text-xs text-destructive">{newError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={cohortPending}
            >
              Anuluj
            </Button>
            <Button
              onClick={handleCreateAndAddCohort}
              disabled={cohortPending || !newName.trim()}
            >
              {cohortPending
                ? 'Tworzenie…'
                : `Stwórz + dodaj ${cohortEligibleN}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
