'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { MoreHorizontalIcon, PencilIcon, TrashIcon, EyeIcon, GripVerticalIcon } from 'lucide-react'

interface DealsKanbanProps {
  deals: (Deal & { client?: { id: string; title: string } | null })[]
  clients: { id: string; title: string }[]
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

function DealCard({
  deal,
  onDelete,
  isDragging,
}: {
  deal: Deal & { client?: { id: string; title: string } | null }
  onDelete: (id: string) => void
  isDragging?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: deal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      minimumFractionDigits: 0,
    }).format(value)
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-50'
      )}
      {...attributes}
      {...listeners}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Link
              href={`/deals/${deal.id}`}
              className="font-medium text-sm hover:underline line-clamp-1"
              onClick={(e) => e.stopPropagation()}
            >
              {deal.title}
            </Link>
            {deal.client && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {deal.client.title}
              </p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={(e) => e.stopPropagation()}
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
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-semibold">{formatCurrency(deal.amount)}</span>
          {deal.close_date && (
            <span className="text-xs text-muted-foreground">
              {new Date(deal.close_date).toLocaleDateString('pl-PL')}
            </span>
          )}
        </div>
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
  deals: (Deal & { client?: { id: string; title: string } | null })[]
  onDelete: (id: string) => void
}) {
  const totalValue = deals.reduce((sum, d) => sum + d.amount, 0)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      minimumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border-2 min-w-[280px] w-[280px]',
        stageColors[stage.value]
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
          {formatCurrency(totalValue)}
        </p>
      </div>
      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-auto p-2 space-y-2 min-h-[200px]">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onDelete={onDelete} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

export function DealsKanban({ deals: initialDeals }: DealsKanbanProps) {
  const [deals, setDeals] = useState(initialDeals)
  const [activeId, setActiveId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
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

    const activeId = active.id as string
    const overId = over.id as string

    // Find which column the item was dropped on
    const deal = deals.find((d) => d.id === activeId)
    if (!deal) return

    // Check if dropped on a deal or the column itself
    const targetDeal = deals.find((d) => d.id === overId)
    const newStage = targetDeal?.stage || (overId as DealStage)

    // Validate it's a valid stage
    if (!DEAL_STAGES.find((s) => s.value === newStage)) {
      // Dropped on another deal, get that deal's stage
      if (targetDeal) {
        await updateDealStage(activeId, targetDeal.stage)
      }
      return
    }

    if (deal.stage !== newStage) {
      await updateDealStage(activeId, newStage)
    }
  }

  const updateDealStage = async (dealId: string, newStage: DealStage) => {
    const { error } = await supabase
      .from('deals')
      .update({ stage: newStage, updated_at: new Date().toISOString() })
      .eq('id', dealId)

    if (!error) {
      setDeals(deals.map((d) =>
        d.id === dealId ? { ...d, stage: newStage } : d
      ))
      router.refresh()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunac te umowe?')) return

    const { error } = await supabase.from('deals').delete().eq('id', id)
    if (!error) {
      setDeals(deals.filter((d) => d.id !== id))
      router.refresh()
    }
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
              <p className="font-medium text-sm">{activeDeal.title}</p>
              {activeDeal.client && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeDeal.client.title}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  )
}
