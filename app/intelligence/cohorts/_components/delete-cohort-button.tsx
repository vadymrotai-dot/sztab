'use client'

// app/intelligence/cohorts/_components/delete-cohort-button.tsx
// Phase 2 Krok 1.C1 — client wrapper for AlertDialog confirmation +
// server-action invocation. Used inside server-rendered cohorts list.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

import { deleteCohort } from '@/lib/actions/cohorts'

export function DeleteCohortButton({
  cohortId,
  cohortName,
  memberCount,
}: {
  cohortId: string
  cohortName: string
  memberCount: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        await deleteCohort(cohortId)
        toast.success(`Cohort "${cohortName}" usunięty`)
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.error(`Błąd usuwania: ${msg}`)
      }
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={pending}
        >
          <Trash2Icon className="size-4" />
          <span className="sr-only">Usuń cohort {cohortName}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Usunąć cohort &quot;{cohortName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            {memberCount > 0 ? (
              <>
                Cohort ma <strong>{memberCount}</strong>{' '}
                {memberCount === 1 ? 'członka' : 'członków'}. Wszystkie
                membership'i zostaną usunięte (CASCADE). Sami prospekty/klienci
                pozostają nietknięci.
              </>
            ) : (
              <>Cohort jest pusty. Operacja nieodwracalna.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Anuluj</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? 'Usuwanie…' : 'Usuń'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
