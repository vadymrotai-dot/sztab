'use client'

// components/table/saved-views-dropdown.tsx
// Sprint S-UX-CORE STEP 4.3 (14.05.2026) — saved views UI dropdown + save modal.
//
// Toolbar element для DataTable. Wired через DataTable.toolbar prop.
// Composition:
//   [▼ Moje widoki: Hot Hurtownie]    [💾 Zapisz widok]
//
// Dropdown features:
//   - List все saved views з checkmark на active (URL params match)
//   - "Domyślny" entry first → clears all filter params
//   - Per-item Trash icon (visible on hover) → confirm dialog → delete
//   - Empty state: "Brak zapisanych widoków"
//
// Save modal (shadcn Dialog):
//   - Input "Nazwa widoku" з autoFocus + Enter submit
//   - Snapshot URL params (excluding ?page=) at time of save
//   - Toast notification on save
//
// Per Vadym spec — POLSKI UI, ukrainian comments.

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  BookmarkIcon,
  ChevronDownIcon,
  PlusCircleIcon,
  Trash2Icon,
  CheckIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import {
  useSavedViews,
  captureCurrentParams,
  paramsEqual,
  type DefaultViewSeed,
} from '@/lib/table/use-saved-views'

interface SavedViewsDropdownProps {
  /** Per-table identifier (e.g. 'prospects', 'cohort:<id>'). */
  tableId: string
  /** Pre-seed examples якщо localStorage empty (first-mount). */
  defaultViews?: DefaultViewSeed[]
  /** URL param keys to exclude з view snapshot (default ['page']). */
  excludeKeys?: string[]
  className?: string
}

export function SavedViewsDropdown({
  tableId,
  defaultViews,
  excludeKeys = ['page'],
  className,
}: SavedViewsDropdownProps) {
  const searchParams = useSearchParams()
  const { views, hydrated, save, load, remove, clearAll } = useSavedViews({
    tableId,
    defaultViews,
  })

  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Current params snapshot (для active detection + save action)
  const currentParams = useMemo(
    () => captureCurrentParams(new URLSearchParams(searchParams.toString()), excludeKeys),
    [searchParams, excludeKeys],
  )

  // Active view: parameter equality з saved view's params
  const activeView = useMemo(
    () => views.find((v) => paramsEqual(v.params, currentParams)),
    [views, currentParams],
  )

  const isDefaultActive = Object.keys(currentParams).length === 0

  const activeLabel = activeView
    ? activeView.name
    : isDefaultActive
      ? 'Domyślny'
      : 'Widok niestandardowy'

  const handleSave = () => {
    const trimmed = saveName.trim()
    if (!trimmed) return
    const id = save(trimmed, currentParams)
    if (id) {
      toast.success(`Widok "${trimmed}" zapisany`)
      setSaveName('')
      setSaveOpen(false)
    }
  }

  const deleteTarget = useMemo(
    () => views.find((v) => v.id === deleteId) ?? null,
    [views, deleteId],
  )

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    remove(deleteTarget.id)
    toast.success(`Widok "${deleteTarget.name}" usunięty`)
    setDeleteId(null)
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'gap-1.5',
              activeView && 'border-emerald-300 bg-emerald-50 text-emerald-800',
            )}
          >
            <BookmarkIcon className="size-3.5" />
            <span className="max-w-[160px] truncate">{activeLabel}</span>
            <ChevronDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs">Moje widoki</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* "Domyślny" entry — clear all params */}
          <DropdownMenuItem
            onClick={() => clearAll()}
            className={cn('cursor-pointer', isDefaultActive && 'bg-muted/40')}
          >
            {isDefaultActive && <CheckIcon className="mr-2 size-3" />}
            <span className={cn(!isDefaultActive && 'pl-5')}>Domyślny</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              bez filtrów
            </span>
          </DropdownMenuItem>

          {hydrated && views.length === 0 ? (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              Brak zapisanych widoków
            </DropdownMenuItem>
          ) : (
            views.map((v) => {
              const isActive = activeView?.id === v.id
              return (
                <DropdownMenuItem
                  key={v.id}
                  onClick={() => load(v.id)}
                  onSelect={(e) => {
                    // Prevent close якщо user clicks trash icon
                    // (handled below via stopPropagation, but belt-and-suspenders)
                    e.preventDefault()
                    load(v.id)
                  }}
                  className={cn(
                    'group cursor-pointer pr-1',
                    isActive && 'bg-emerald-50',
                  )}
                >
                  {isActive && <CheckIcon className="mr-2 size-3 text-emerald-700" />}
                  <span
                    className={cn('truncate', !isActive && 'pl-5')}
                    title={v.name}
                  >
                    {v.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Usuń widok ${v.name}`}
                    className="ml-auto rounded p-1 opacity-0 transition-opacity hover:bg-rose-100 group-hover:opacity-100"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setDeleteId(v.id)
                    }}
                  >
                    <Trash2Icon className="size-3 text-rose-600" />
                  </button>
                </DropdownMenuItem>
              )
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setSaveOpen(true)}
        className="gap-1.5"
        title="Zapisz aktualne filtry, sortowanie i wyszukiwanie jako nowy widok"
      >
        <PlusCircleIcon className="size-3.5" />
        Zapisz widok
      </Button>

      {/* Save modal */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Zapisz aktualny widok</DialogTitle>
            <DialogDescription>
              Zachowaj obecne filtry, sortowanie i wyszukiwanie pod własną nazwą.
              Możesz później wrócić do tego widoku jednym kliknięciem.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="view-name">Nazwa widoku</Label>
            <Input
              id="view-name"
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSave()
                }
              }}
              placeholder="np. Hot Hurtownie UA"
              maxLength={60}
            />
            <p className="text-[10px] text-muted-foreground">
              Snapshot: {Object.keys(currentParams).length}{' '}
              {Object.keys(currentParams).length === 1
                ? 'parametr filtra'
                : 'parametrów filtra'}
              {Object.keys(currentParams).length === 0 && ' (bez aktywnych filtrów)'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSave} disabled={!saveName.trim()}>
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć widok?</AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno chcesz usunąć widok{' '}
              <strong>&quot;{deleteTarget?.name ?? ''}&quot;</strong>? Tej akcji
              nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
