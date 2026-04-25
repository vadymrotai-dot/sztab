'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import type { Deal, DealStage } from '@/lib/types'
import { DEAL_STAGES } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  CalendarIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
} from 'lucide-react'

type DealRow = Deal & {
  client?: { id: string; title: string } | null
  product?: { id: string; name: string } | null
}

interface DealsKanbanProps {
  deals: DealRow[]
}

const stageColors: Record<DealStage, string> = {
  lead: 'border-slate-300 bg-slate-50',
  oferta: 'border-blue-300 bg-blue-50',
  negocjacje: 'border-amber-300 bg-amber-50',
  sample: 'border-violet-300 bg-violet-50',
  kontrakt: 'border-cyan-300 bg-cyan-50',
  wygrana: 'border-green-300 bg-green-50',
  przegrana: 'border-red-300 bg-red-50',
}

const stageTitleColors: Record<DealStage, string> = {
  lead: 'text-slate-700',
  oferta: 'text-blue-700',
  negocjacje: 'text-amber-700',
  sample: 'text-violet-700',
  kontrakt: 'text-cyan-700',
  wygrana: 'text-green-700',
  przegrana: 'text-red-700',
}

const plnFormatter = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 0,
})

const formatPLN = (value: number) => plnFormatter.format(value)

const formatPLNCompact = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} mln zł`
  if (value >= 10_000) return `${Math.round(value / 1_000)}k zł`
  return formatPLN(value)
}

const dealValue = (deal: Deal) => deal.total_value ?? deal.amount ?? 0

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const isOverdue = (date: string) => new Date(date) < startOfToday()

const marginBadgeClass = (pct: number) => {
  if (pct < 20) return 'bg-red-100 text-red-800 hover:bg-red-100'
  if (pct < 35) return 'bg-amber-100 text-amber-800 hover:bg-amber-100'
  return 'bg-green-100 text-green-800 hover:bg-green-100'
}

function DealCard({
  deal,
  onDelete,
}: {
  deal: DealRow
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  const value = dealValue(deal)
  const productName = deal.product?.name
  const overdue = deal.next_action_date ? isOverdue(deal.next_action_date) : false
  const showLegacyTitle = Boolean(productName) && Boolean(deal.title) && deal.title !== productName

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="cursor-grab active:cursor-grabbing touch-none"
      {...attributes}
      {...listeners}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm line-clamp-1">
              {productName || deal.title || 'Bez nazwy'}
            </p>
            {deal.client && (
              <Link
                href={`/clients/${deal.client.id}`}
                className="text-xs text-muted-foreground hover:underline truncate block"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {deal.client.title}
              </Link>
            )}
            {showLegacyTitle && (
              <p className="text-[11px] text-muted-foreground italic line-clamp-1 mt-0.5">
                {deal.title}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {deal.person_id && (
              <UserIcon
                className="size-3.5 text-muted-foreground"
                aria-label="Z osobą kontaktową"
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <MoreHorizontalIcon className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/deals/${deal.id}`}>
                    <EyeIcon className="mr-2 size-4" />
                    Zobacz
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/deals/${deal.id}/edit`}>
                    <PencilIcon className="mr-2 size-4" />
                    Edytuj
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(deal.id)
                  }}
                >
                  <TrashIcon className="mr-2 size-4" />
                  Usun
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{formatPLN(value)}</span>
          {deal.margin_pct != null && Number.isFinite(deal.margin_pct) && (
            <Badge
              variant="outline"
              className={cn(
                'text-xs font-medium border-transparent',
                marginBadgeClass(deal.margin_pct)
              )}
            >
              {Math.round(deal.margin_pct)}%
            </Badge>
          )}
        </div>
        {deal.next_action_date && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs',
              overdue ? 'text-destructive font-medium' : 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="size-3" />
            <span>
              {new Date(deal.next_action_date).toLocaleDateString('pl-PL', {
                day: 'numeric',
                month: 'short',
              })}
              {overdue && ' · zaległe'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function KanbanColumn({
  stage,
  deals,
  onDelete,
}: {
  stage: { value: DealStage; label: string }
  deals: DealRow[]
  onDelete: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.value })

  const totalValue = deals.reduce((sum, d) => sum + dealValue(d), 0)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-lg border-2 min-w-[280px] w-[280px] transition-colors',
        stageColors[stage.value],
        isOver && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      <div className="p-3 border-b border-inherit">
        <div className="flex items-center justify-between">
          <h3 className={cn('font-semibold text-sm', stageTitleColors[stage.value])}>
            {stage.label}
          </h3>
          <Badge variant="secondary" className="text-xs">
            {deals.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {formatPLNCompact(totalValue)}
        </p>
      </div>
      <SortableContext
        items={deals.map((d) => d.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 overflow-auto p-2 space-y-2 min-h-[160px]">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onDelete={onDelete} />
          ))}
        </div>
      </SortableContext>
      <div className="p-2 border-t border-inherit">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href={`/deals/new?stage=${stage.value}`}>
            <PlusIcon className="mr-2 size-3.5" />
            Dodaj umowe
          </Link>
        </Button>
      </div>
    </div>
  )
}

export function DealsKanban({ deals: initialDeals }: DealsKanbanProps) {
  const [deals, setDeals] = useState<DealRow[]>(initialDeals)
  const [activeId, setActiveId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const activeIdStr = active.id as string
    const overIdStr = over.id as string

    const deal = deals.find((d) => d.id === activeIdStr)
    if (!deal) return

    let newStage: DealStage
    const stageMatch = DEAL_STAGES.find((s) => s.value === overIdStr)
    if (stageMatch) {
      newStage = stageMatch.value
    } else {
      const targetDeal = deals.find((d) => d.id === overIdStr)
      if (!targetDeal) return
      newStage = targetDeal.stage
    }

    if (deal.stage === newStage) return

    await updateDealStage(deal, newStage)
  }

  const updateDealStage = async (deal: DealRow, newStage: DealStage) => {
    const fromStage = deal.stage

    setDeals((prev) =>
      prev.map((d) => (d.id === deal.id ? { ...d, stage: newStage } : d))
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Sesja wygasła. Zaloguj się ponownie.')
      setDeals((prev) =>
        prev.map((d) => (d.id === deal.id ? { ...d, stage: fromStage } : d))
      )
      return
    }

    const { error: updateError } = await supabase
      .from('deals')
      .update({ stage: newStage, updated_at: new Date().toISOString() })
      .eq('id', deal.id)

    if (updateError) {
      toast.error(`Nie udało się zmienić etapu: ${updateError.message}`)
      setDeals((prev) =>
        prev.map((d) => (d.id === deal.id ? { ...d, stage: fromStage } : d))
      )
      return
    }

    const { error: eventError } = await supabase.from('deal_events').insert({
      deal_id: deal.id,
      event_type: 'stage_change',
      from_stage: fromStage,
      to_stage: newStage,
      owner_id: user.id,
    })
    if (eventError) {
      console.warn('deal_events insert failed:', eventError.message)
    }

    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunac te umowe?')) return
    const { error } = await supabase.from('deals').delete().eq('id', id)
    if (error) {
      toast.error(`Usunięcie nie powiodło się: ${error.message}`)
      return
    }
    setDeals((prev) => prev.filter((d) => d.id !== id))
    router.refresh()
  }

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4">
          {DEAL_STAGES.map((stage) => (
            <KanbanColumn
              key={stage.value}
              stage={stage}
              deals={deals.filter((d) => d.stage === stage.value)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {activeDeal && (
          <Card className="cursor-grabbing shadow-lg w-[264px]">
            <CardContent className="p-3">
              <p className="font-medium text-sm line-clamp-1">
                {activeDeal.product?.name || activeDeal.title || 'Bez nazwy'}
              </p>
              {activeDeal.client && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {activeDeal.client.title}
                </p>
              )}
              <p className="text-sm font-semibold mt-2">
                {formatPLN(dealValue(activeDeal))}
              </p>
            </CardContent>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  )
}
