'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { TrashIcon } from 'lucide-react'

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
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import { deleteSupplier } from '@/app/actions/suppliers'

interface DeleteButtonProps {
  id: string
  name: string
}

export function DeleteButton({ id, name }: DeleteButtonProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteSupplier(id)
      if (!result.ok) {
        toast.error(`Nie usunięto: ${result.error}`)
        return
      }
      toast.success('Dostawca usunięty')
      router.push('/suppliers')
      router.refresh()
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={pending}>
          <TrashIcon className="mr-2 size-4" />
          Usuń
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Czy na pewno usunąć dostawcę?</AlertDialogTitle>
          <AlertDialogDescription>
            Usuwasz „{name}”. Ta akcja jest nieodwracalna. Produkty powiązane z
            tym dostawcą będą miały supplier_id = NULL.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Anuluj</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending && <Spinner className="mr-2" />}
            Usuń dostawcę
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
