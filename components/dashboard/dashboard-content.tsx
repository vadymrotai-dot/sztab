'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertCircleIcon,
  CalendarCheckIcon,
  CalendarIcon,
  ClockIcon,
  FlameIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'

import { createClient } from '@/lib/supabase/client'
import type { Deal, DealStage, Habit, Task, TaskPriority } from '@/lib/types'
import { DEAL_STAGES } from '@/lib/types'
import { cn } from '@/lib/utils'

type DealRow = Deal & {
  client?: { id: string; title: string } | null
  product?: { id: string; name: string } | null
}

type AggregateDeal = {
  id: string
  total_value?: number | null
  amount?: number | null
  margin_amount?: number | null
}

type TaskRow = Task & {
  client?: { id: string; title: string } | null
  goal?: { id: string; title: string } | null
}

interface DashboardContentProps {
  today: string
  weekDays: string[]
  callToday: DealRow[]
  openDeals: AggregateDeal[]
  wonThisMonth: AggregateDeal[]
  lostThisMonth: AggregateDeal[]
  noNextAction: DealRow[]
  stale: DealRow[]
  stuckNegotiation: DealRow[]
  closingSoon: DealRow[]
  tasksToday: TaskRow[]
  habits: Habit[]
}

// Combined to-do queue. Deals carry priority=3 (treated as "high")
// because every active deal has a known client and is warmer than a
// generic task; tasks carry their own priority rank.
type TodoDealItem = {
  kind: 'deal'
  key: string
  deal: DealRow
  date: string
  urgency: -1 | 0 | 1
  priority: number
  typeRank: 0
}

type TodoTaskItem = {
  kind: 'task'
  key: string
  task: TaskRow
  date: string | null
  urgency: -1 | 0 | 1
  priority: number
  typeRank: 1
}

type TodoItem = TodoDealItem | TodoTaskItem

const stageBadgeColors: Record<DealStage, string> = {
  lead: 'bg-slate-100 text-slate-800',
  oferta: 'bg-blue-100 text-blue-800',
  negocjacje: 'bg-amber-100 text-amber-800',
  sample: 'bg-violet-100 text-violet-800',
  kontrakt: 'bg-cyan-100 text-cyan-800',
  wygrana: 'bg-green-100 text-green-800',
  przegrana: 'bg-red-100 text-red-800',
}

const stageLabels: Record<DealStage, string> = Object.fromEntries(
  DEAL_STAGES.map((s) => [s.value, s.label]),
) as Record<DealStage, string>

const plnFormatter = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 0,
})

const formatPLN = (value: number) => plnFormatter.format(value)

const dealValue = (d: { total_value?: number | null; amount?: number | null }) =>
  d.total_value ?? d.amount ?? 0

const startOfDayUTC = (iso: string) => {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  return d
}

const daysBetween = (fromISO: string, toISO: string) => {
  const from = startOfDayUTC(fromISO).getTime()
  const to = startOfDayUTC(toISO).getTime()
  return Math.round((to - from) / 86_400_000)
}

const formatRelativeDay = (target: string, today: string) => {
  const diff = daysBetween(today, target)
  if (diff < 0) return `${-diff} ${-diff === 1 ? 'dzień' : 'dni'} temu`
  if (diff === 0) return 'dziś'
  if (diff === 1) return 'jutro'
  return `za ${diff} dni`
}

const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
  })

const dealHeading = (deal: DealRow) =>
  deal.product?.name || deal.title || 'Bez nazwy'

const priorityRank: Record<TaskPriority, number> = {
  high: 3,
  normal: 2,
  low: 1,
}

const priorityBadgeClass: Record<TaskPriority, string> = {
  high: 'bg-red-50 text-red-700 border-transparent',
  normal: 'bg-yellow-50 text-yellow-700 border-transparent',
  low: 'bg-gray-50 text-gray-600 border-transparent',
}

const priorityLabel: Record<TaskPriority, string> = {
  high: 'Wysoki',
  normal: 'Normalny',
  low: 'Niski',
}

const urgencyOf = (date: string | null, today: string): -1 | 0 | 1 => {
  if (!date) return 0
  const diff = daysBetween(today, date)
  if (diff < 0) return -1
  if (diff === 0) return 0
  return 1
}

function StageBadge({ stage }: { stage: DealStage }) {
  return (
    <Badge variant="outline" className={cn('border-transparent', stageBadgeColors[stage])}>
      {stageLabels[stage]}
    </Badge>
  )
}

function ItemTypeBadge({ kind }: { kind: 'deal' | 'task' }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent text-xs shrink-0',
        kind === 'deal'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-gray-100 text-gray-700',
      )}
    >
      {kind === 'deal' ? 'Umowa' : 'Zadanie'}
    </Badge>
  )
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge
      variant="outline"
      className={cn('shrink-0 text-xs', priorityBadgeClass[priority])}
    >
      {priorityLabel[priority]}
    </Badge>
  )
}

function StatCard({
  title,
  primary,
  secondary,
  icon: Icon,
  iconClass,
}: {
  title: string
  primary: string
  secondary?: string
  icon: typeof TargetIcon
  iconClass?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn('size-4 text-muted-foreground', iconClass)} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{primary}</div>
        {secondary && (
          <p className="text-xs text-muted-foreground">{secondary}</p>
        )}
      </CardContent>
    </Card>
  )
}

function DealTodoRow({
  item,
  today,
}: {
  item: TodoDealItem
  today: string
}) {
  const { deal, date } = item
  const overdue = daysBetween(today, date) < 0
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <Link
        href={`/deals/${deal.id}/edit`}
        className="block group"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ItemTypeBadge kind="deal" />
          <span className="text-sm font-medium truncate group-hover:underline">
            {dealHeading(deal)}
          </span>
          {deal.client && (
            <span className="text-xs text-muted-foreground truncate">
              · {deal.client.title}
            </span>
          )}
          <StageBadge stage={deal.stage} />
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <span
            className={cn(
              'flex items-center gap-1',
              overdue
                ? 'text-destructive font-medium'
                : 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="size-3" />
            {formatRelativeDay(date, today)}
          </span>
          <span className="text-muted-foreground italic line-clamp-1">
            {deal.next_action_note || 'Zadzwoń'}
          </span>
        </div>
      </Link>
    </li>
  )
}

function TaskTodoRow({
  item,
  today,
  onComplete,
}: {
  item: TodoTaskItem
  today: string
  onComplete: (id: string, done: boolean) => void
}) {
  const { task, date } = item
  const overdue = date != null && daysBetween(today, date) < 0
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Checkbox
        checked={task.done}
        onCheckedChange={(checked) => onComplete(task.id, !!checked)}
        className="mt-0.5"
      />
      <Link
        href={`/tasks?focus=${task.id}`}
        className="flex-1 min-w-0 group"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ItemTypeBadge kind="task" />
          <span className="text-sm font-medium truncate group-hover:underline">
            {task.title}
          </span>
          {task.client && (
            <span className="text-xs text-muted-foreground truncate">
              · {task.client.title}
            </span>
          )}
          {task.goal && (
            <span className="text-xs text-muted-foreground italic">
              cel: {task.goal.title}
            </span>
          )}
        </div>
        {date && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span
              className={cn(
                'flex items-center gap-1',
                overdue
                  ? 'text-destructive font-medium'
                  : 'text-muted-foreground',
              )}
            >
              <CalendarIcon className="size-3" />
              {formatRelativeDay(date, today)}
            </span>
          </div>
        )}
      </Link>
      <PriorityBadge priority={task.priority} />
    </li>
  )
}

function DealRowItem({
  deal,
  trailing,
  highlight,
}: {
  deal: DealRow
  trailing?: React.ReactNode
  highlight?: boolean
}) {
  return (
    <li
      className={cn(
        'flex items-center justify-between gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors',
        highlight && 'bg-destructive/5',
      )}
    >
      <Link
        href={`/deals/${deal.id}`}
        className="flex-1 min-w-0 hover:underline"
      >
        <p className="text-sm font-medium truncate">{dealHeading(deal)}</p>
        {deal.client && (
          <p className="text-xs text-muted-foreground truncate">
            {deal.client.title}
          </p>
        )}
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <StageBadge stage={deal.stage} />
        <span className="text-sm font-medium tabular-nums">
          {formatPLN(dealValue(deal))}
        </span>
        {trailing}
      </div>
    </li>
  )
}

export function DashboardContent({
  today,
  weekDays,
  callToday,
  openDeals,
  wonThisMonth,
  lostThisMonth,
  noNextAction,
  stale,
  stuckNegotiation,
  closingSoon,
  tasksToday: initialTasks,
  habits: initialHabits,
}: DashboardContentProps) {
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks)
  const [habits, setHabits] = useState<Habit[]>(initialHabits)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Combined deal-actions + tasks queue. Sorted as:
  //   1) overdue first, then today, then future
  //   2) within urgency: priority high → normal/low (deals always count
  //      as priority 3 because they're warmer with a known client)
  //   3) within urgency+priority: deals before tasks
  //   4) tie-break by date asc
  const todoItems = useMemo<TodoItem[]>(() => {
    const dealItems: TodoDealItem[] = callToday
      .filter((d) => d.next_action_date)
      .map((d) => {
        const date = d.next_action_date as string
        return {
          kind: 'deal',
          key: `deal-${d.id}`,
          deal: d,
          date,
          urgency: urgencyOf(date, today),
          priority: 3,
          typeRank: 0,
        }
      })

    const taskItems: TodoTaskItem[] = tasks
      .filter((t) => !t.done)
      .map((t) => ({
        kind: 'task',
        key: `task-${t.id}`,
        task: t,
        date: t.due ?? null,
        urgency: urgencyOf(t.due ?? null, today),
        priority: priorityRank[t.priority] ?? 0,
        typeRank: 1,
      }))

    return [...dealItems, ...taskItems].sort((a, b) => {
      if (a.urgency !== b.urgency) return a.urgency - b.urgency
      if (a.priority !== b.priority) return b.priority - a.priority
      if (a.typeRank !== b.typeRank) return a.typeRank - b.typeRank
      return (a.date ?? '').localeCompare(b.date ?? '')
    })
  }, [callToday, tasks, today])

  const visibleTodos = todoItems.slice(0, 15)
  const overflowTodos = Math.max(0, todoItems.length - 15)

  const openCount = openDeals.length
  const openSum = openDeals.reduce((s, d) => s + dealValue(d), 0)
  const wonCount = wonThisMonth.length
  const wonSum = wonThisMonth.reduce((s, d) => s + dealValue(d), 0)
  const wonMargin = wonThisMonth.reduce(
    (s, d) => s + (d.margin_amount ?? 0),
    0,
  )
  const lostCount = lostThisMonth.length
  const lostSum = lostThisMonth.reduce((s, d) => s + dealValue(d), 0)
  const avgDealSize = openCount > 0 ? openSum / openCount : 0

  const handleTaskComplete = async (taskId: string, done: boolean) => {
    const completed_at = done ? today : null
    setTasks((prev) =>
      prev
        .map((t) => (t.id === taskId ? { ...t, done, completed_at } : t))
        .filter((t) => !t.done),
    )

    const { error } = await supabase
      .from('tasks')
      .update({ done, completed_at })
      .eq('id', taskId)

    if (error) {
      toast.error(`Nie zapisano: ${error.message}`)
      router.refresh()
      return
    }
    router.refresh()
  }

  const handleHabitToggle = async (habitId: string, date: string) => {
    const habit = habits.find((h) => h.id === habitId)
    if (!habit) return
    const log = habit.log ?? {}
    const newLog = { ...log, [date]: !log[date] }

    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? { ...h, log: newLog } : h)),
    )

    const { error } = await supabase
      .from('habits')
      .update({ log: newLog })
      .eq('id', habitId)

    if (error) {
      setHabits((prev) =>
        prev.map((h) => (h.id === habitId ? { ...h, log } : h)),
      )
      toast.error(`Nie zapisano: ${error.message}`)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Section 1: Do zrobienia dziś — combined deals + tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="size-5" />
            Do zrobienia dziś
          </CardTitle>
          <CardDescription>
            {todoItems.length === 0
              ? 'Pusto. Idealny dzień, żeby ruszyć coś nowego.'
              : `${todoItems.length} ${
                  todoItems.length === 1 ? 'rzecz' : 'rzeczy'
                } w kolejce — umowy i zadania razem.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {todoItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nic do zrobienia dziś. 🎉 Korzystaj z dnia.
            </p>
          ) : (
            <ul className="divide-y">
              {visibleTodos.map((item) =>
                item.kind === 'deal' ? (
                  <DealTodoRow key={item.key} item={item} today={today} />
                ) : (
                  <TaskTodoRow
                    key={item.key}
                    item={item}
                    today={today}
                    onComplete={handleTaskComplete}
                  />
                ),
              )}
            </ul>
          )}
          {overflowTodos > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              ...i jeszcze {overflowTodos} do zrobienia.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Pipeline overview */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <TargetIcon className="size-5" />
          Pipeline overview
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Otwarte umowy"
            primary={`${openCount}`}
            secondary={formatPLN(openSum)}
            icon={TargetIcon}
          />
          <StatCard
            title="Wygrane (ten miesiąc)"
            primary={`${wonCount} · ${formatPLN(wonSum)}`}
            secondary={`Marża: ${formatPLN(wonMargin)}`}
            icon={TrendingUpIcon}
            iconClass="text-green-600"
          />
          <StatCard
            title="Przegrane (ten miesiąc)"
            primary={`${lostCount} · ${formatPLN(lostSum)}`}
            secondary={
              lostCount > 0
                ? `Średnio ${formatPLN(lostSum / lostCount)}`
                : 'Brak strat'
            }
            icon={TrendingDownIcon}
            iconClass="text-red-600"
          />
          <StatCard
            title="Średnia wartość otwartej"
            primary={formatPLN(avgDealSize)}
            secondary={
              openCount > 0
                ? `Bazuje na ${openCount} otwartych umowach`
                : 'Brak otwartych umów'
            }
            icon={TargetIcon}
          />
        </div>
      </div>

      {/* Section 3: Twoje nawyki — hidden if no habits exist */}
      {habits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheckIcon className="size-5" />
              Twoje nawyki
            </CardTitle>
            <CardDescription>
              Bieżący tydzień (poniedziałek → niedziela). Klik w kafelek
              przełącza wykonanie nawyku w danym dniu.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {habits.map((habit) => {
              const log = habit.log ?? {}
              const completedThisWeek = weekDays.filter((d) => log[d]).length
              return (
                <div
                  key={habit.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {habit.name}
                      </p>
                      {completedThisWeek > 0 && (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <FlameIcon className="size-3" />
                          {completedThisWeek}/7
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {weekDays.map((date) => {
                      const isCompleted = !!log[date]
                      const isToday = date === today
                      return (
                        <button
                          key={date}
                          type="button"
                          onClick={() => handleHabitToggle(habit.id, date)}
                          className={cn(
                            'flex h-9 min-w-[28px] flex-col items-center justify-center rounded-md text-xs transition-colors',
                            isCompleted
                              ? 'bg-green-500 text-white'
                              : 'bg-muted hover:bg-muted/80',
                            isToday && !isCompleted && 'ring-2 ring-primary',
                          )}
                          title={date}
                        >
                          <span className="text-[10px] leading-none opacity-70">
                            {new Date(date).toLocaleDateString('pl-PL', {
                              weekday: 'narrow',
                            })}
                          </span>
                          <span className="font-medium">
                            {new Date(date).getDate()}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <Link
              href="/habits"
              className="text-xs text-muted-foreground hover:underline"
            >
              Zarządzaj nawykami →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Section 4: Wymagają uwagi */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircleIcon className="size-5 text-amber-600" />
            Wymagają uwagi
          </CardTitle>
          <CardDescription>
            Otwarte umowy bez planu, bez ruchu lub utknięte w negocjacjach.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AttentionGroup
            title="Bez zaplanowanej akcji"
            description="Otwarte umowy, dla których next_action_date nie jest ustawiona."
            deals={noNextAction}
          />
          <AttentionGroup
            title="Bez ruchu > 14 dni"
            description="Otwarte umowy, których updated_at jest starszy niż 14 dni."
            deals={stale}
          />
          <AttentionGroup
            title="W negocjacjach > 30 dni"
            description="Umowy w etapie Negocjacje, które nie były zmieniane od 30 dni."
            deals={stuckNegotiation}
          />
        </CardContent>
      </Card>

      {/* Section 5: Najbliższe 7 dni */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClockIcon className="size-5" />
            Najbliższe 7 dni
          </CardTitle>
          <CardDescription>
            Otwarte umowy z planowaną datą zamknięcia w najbliższym tygodniu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {closingSoon.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak umów planowanych do zamknięcia w tym tygodniu.
            </p>
          ) : (
            <ul className="divide-y">
              {closingSoon.map((deal) => (
                <DealRowItem
                  key={deal.id}
                  deal={deal}
                  trailing={
                    deal.expected_close_date && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatShortDate(deal.expected_close_date)}
                      </span>
                    )
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AttentionGroup({
  title,
  description,
  deals,
}: {
  title: string
  description: string
  deals: DealRow[]
}) {
  if (deals.length === 0) return null
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold">
          {title}
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            ({deals.length})
          </span>
        </h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ul className="divide-y">
        {deals.slice(0, 8).map((deal) => (
          <DealRowItem key={deal.id} deal={deal} />
        ))}
      </ul>
      {deals.length > 8 && (
        <p className="text-xs text-muted-foreground mt-2">
          ...i jeszcze {deals.length - 8}.
        </p>
      )}
    </div>
  )
}
