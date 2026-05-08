'use client'

// app/intelligence/prospects/_components/bulk-action-bar.tsx
// Phase 2 Krok 1.C1 (08.05.2026) — sticky bottom bulk action bar.
// Consolidates "Dodaj do klientów" (existing) + new cohort actions:
//   - Dodaj do cohort: <Select existing>
//   - + Nowa cohort (inline Dialog)
//   - Wyczyść
//
// Bar appears coли selected.size > 0. Sticky bottom-0 z-10 — releases at
// table bottom (pagination footer NOT overlapped, lives below у parent).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
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

import { addProspectsToCohort, createCohort } from '@/lib/actions/cohorts'

const NAME_MAX = 100
const DESC_MAX = 500

export interface CohortOption {
  id: string
  name: string
  member_count: number
}

interface BulkActionBarProps {
  selectedIds: string[]
  cohorts: CohortOption[]
  onAddToClients: () => void
  onClear: () => void
  pending: boolean
}

export function BulkActionBar({
  selectedIds,
  cohorts,
  onAddToClients,
  onClear,
  pending,
}: BulkActionBarProps) {
  const router = useRouter()
  const [cohortPending, startCohortTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newError, setNewError] = useState<string | null>(null)

  const handleAddToCohort = (cohortId: string) => {
    if (!cohortId) return
    const cohort = cohorts.find((c) => c.id === cohortId)
    const cohortName = cohort?.name ?? cohortId.slice(0, 8)
    startCohortTransition(async () => {
      try {
        const res = await addProspectsToCohort(cohortId, selectedIds)
        if (res.added > 0 && res.skipped > 0) {
          toast.success(
            `${res.added} dodano, ${res.skipped} już było w "${cohortName}"`,
          )
        } else if (res.added > 0) {
          toast.success(`${res.added} prospekti dodano do "${cohortName}"`)
        } else {
          toast.info(
            `Wszystkie ${res.skipped} już są w "${cohortName}"`,
          )
        }
        onClear()
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.error(`Błąd: ${msg}`)
      }
    })
  }

  const handleCreateAndAdd = () => {
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
        const res = await addProspectsToCohort(created.id, selectedIds)
        toast.success(
          `Cohort "${created.name}" utworzony — ${res.added} prospekti dodano`,
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

  const allBusy = pending || cohortPending
  const count = selectedIds.length

  return (
    <>
      <div className="sticky bottom-0 z-10 -mx-1 mt-3 flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <span className="text-sm font-medium">
          Wybrano: <span className="tabular-nums">{count}</span>
        </span>

        <Separator orientation="vertical" className="h-6" />

        <Button size="sm" onClick={onAddToClients} disabled={allBusy}>
          {pending ? 'Dodawanie…' : 'Dodaj do klientów'}
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <span className="text-sm text-muted-foreground">Dodaj do cohort:</span>
        <Select
          onValueChange={handleAddToCohort}
          value=""
          disabled={allBusy || cohorts.length === 0}
        >
          <SelectTrigger size="sm" className="h-8 w-[220px]">
            <SelectValue
              placeholder={
                cohorts.length === 0
                  ? 'Brak cohortów — stwórz nową'
                  : cohortPending
                    ? 'Dodawanie…'
                    : 'Wybierz cohort…'
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

        <Button
          size="sm"
          variant="outline"
          onClick={() => setDialogOpen(true)}
          disabled={allBusy}
        >
          <PlusIcon className="mr-1 size-4" />
          Nowa cohort
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <Button
          variant="link"
          size="sm"
          onClick={onClear}
          disabled={allBusy}
          className="ml-auto h-auto p-0 text-xs text-muted-foreground"
        >
          Wyczyść zaznaczenie
        </Button>
      </div>

      {/* + Nowa cohort dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !cohortPending && setDialogOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nowa cohort</DialogTitle>
            <DialogDescription>
              Po utworzeniu, {count}{' '}
              {count === 1 ? 'wybrany prospekt' : 'wybranych prospektów'}{' '}
              zostanie automatycznie dodany do nowej cohortу.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-cohort-name">
                Nazwa <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-cohort-name"
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
              <Label htmlFor="new-cohort-description">Opis (opcjonalnie)</Label>
              <Textarea
                id="new-cohort-description"
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
              onClick={handleCreateAndAdd}
              disabled={cohortPending || !newName.trim()}
            >
              {cohortPending ? 'Tworzenie…' : `Stwórz + dodaj ${count}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
