'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HotLeadyChips, type HotLead } from '@/components/dzis/hot-leady-chips'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import type { Task, Goal } from '@/lib/types'
import { TASK_PRIORITIES, TASK_SPHERES } from '@/lib/types'
import { PlusIcon, MoreHorizontalIcon, TrashIcon, CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TasksContentProps {
  tasks: (Task & { client?: { id: string; title: string } | null; goal?: { id: string; title: string } | null })[]
  clients: { id: string; title: string }[]
  goals: { id: string; title: string }[]
  /** Sprint S4 Phase 4B — top hot leady дla empty state action prompt. */
  hotLeads?: HotLead[]
}

type TaskFilter = 'dzis' | 'tydzien' | 'wszystko' | 'pilne'

const priorityColors: Record<string, string> = {
  low: 'text-muted-foreground',
  normal: 'text-foreground',
  high: 'text-destructive font-medium',
}

const sphereColors: Record<string, string> = {
  praca: 'bg-blue-500',
  zdrowie: 'bg-green-500',
  relacje: 'bg-pink-500',
  rozwoj: 'bg-amber-500',
  finanse: 'bg-emerald-500',
}

export function TasksContent({
  tasks: initialTasks,
  clients,
  goals,
  hotLeads = [],
}: TasksContentProps) {
  const [tasks, setTasks] = useState(initialTasks)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const [filter, setFilter] = useState<TaskFilter>('dzis')
  const [showCompleted, setShowCompleted] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    due: '',
    time: '',
    priority: 'normal' as Task['priority'],
    sphere: 'praca' as Task['sphere'],
    client_id: '',
    goal_id: '',
  })
  const router = useRouter()
  const supabase = createClient()

  const today = new Date().toISOString().split('T')[0]
  const weekFromNow = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .split('T')[0]

  // Sprint S4 Phase 4B — open Dialog gdy URL ma ?new=1, optionally
  // pre-fill client_id з ?client_id=…
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      const preClient = searchParams.get('client_id') ?? ''
      setFormData((prev) => ({ ...prev, client_id: preClient }))
      setOpen(true)
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: formData.title,
        due: formData.due || null,
        time: formData.time || null,
        priority: formData.priority,
        sphere: formData.sphere,
        client_id: formData.client_id || null,
        goal_id: formData.goal_id || null,
        owner_id: user.id,
      })
      .select('*, client:clients(id, title), goal:goals(id, title)')
      .single()

    if (!error && data) {
      setTasks([data, ...tasks])
    }

    setLoading(false)
    setOpen(false)
    setFormData({
      title: '',
      due: '',
      time: '',
      priority: 'normal',
      sphere: 'praca',
      client_id: '',
      goal_id: '',
    })
    router.refresh()
  }

  const handleToggle = async (taskId: string, done: boolean) => {
    const { error } = await supabase
      .from('tasks')
      .update({ done, completed_at: done ? today : null })
      .eq('id', taskId)

    if (!error) {
      setTasks(tasks.map((t) => (t.id === taskId ? { ...t, done, completed_at: done ? today : null } : t)))
      router.refresh()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunac to zadanie?')) return

    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (!error) {
      setTasks(tasks.filter((t) => t.id !== id))
      router.refresh()
    }
  }

  const pendingTasks = tasks.filter((t) => !t.done)
  const completedTasks = tasks.filter((t) => t.done)
  const overdueTasks = pendingTasks.filter((t) => t.due && t.due < today)
  const todayTasks = pendingTasks.filter((t) => t.due === today)

  // Sprint S4 Phase 4B — filter chips replace pending/completed tabs.
  const filteredTasks = useMemo(() => {
    if (filter === 'dzis') return [...overdueTasks, ...todayTasks]
    if (filter === 'tydzien')
      return pendingTasks.filter((t) => t.due && t.due <= weekFromNow)
    if (filter === 'pilne')
      return pendingTasks.filter(
        (t) => t.priority === 'high' || (t.due && t.due < today),
      )
    return pendingTasks
  }, [filter, pendingTasks, overdueTasks, todayTasks, weekFromNow, today])

  const filterCounts: Record<TaskFilter, number> = {
    dzis: overdueTasks.length + todayTasks.length,
    tydzien: pendingTasks.filter((t) => t.due && t.due <= weekFromNow).length,
    wszystko: pendingTasks.length,
    pilne: pendingTasks.filter(
      (t) => t.priority === 'high' || (t.due && t.due < today),
    ).length,
  }

  const filterLabels: Record<TaskFilter, string> = {
    dzis: 'Dziś',
    tydzien: 'Tydzień',
    wszystko: 'Wszystko',
    pilne: 'Pilne',
  }

  const emptyMessage: Record<TaskFilter, string> = {
    dzis: 'Brak zadań na dziś',
    tydzien: 'Brak zadań w tym tygodniu',
    wszystko: 'Brak zadań do zrobienia',
    pilne: 'Brak pilnych zadań',
  }

  const TaskItem = ({ task }: { task: typeof tasks[0] }) => (
    <Card>
      <CardContent className="flex items-start gap-3 py-3">
        <Checkbox
          checked={task.done}
          onCheckedChange={(checked) => handleToggle(task.id, !!checked)}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={cn('text-white text-xs', sphereColors[task.sphere])}>
              {task.sphere}
            </Badge>
            <p className={cn('text-sm flex-1', priorityColors[task.priority], task.done && 'line-through opacity-60')}>
              {task.title}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {task.due && (
              <span className={cn('text-xs flex items-center gap-1', task.due < today && !task.done && 'text-destructive')}>
                <CalendarIcon className="size-3" />
                {task.due} {task.time && `o ${task.time}`}
              </span>
            )}
            {task.client && (
              <span className="text-xs text-muted-foreground">• {task.client.title}</span>
            )}
            {task.goal && (
              <span className="text-xs text-muted-foreground">• Cel: {task.goal.title}</span>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(task.id)}>
              <TrashIcon className="mr-2 size-4" />
              Usun
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  )

  const topHotLead = hotLeads[0]

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {(['dzis', 'tydzien', 'wszystko', 'pilne'] as TaskFilter[]).map((f) => {
          const active = f === filter
          const count = filterCounts[f]
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition ${
                active
                  ? 'border-[#4F46E5] bg-[#EEEDFE] text-[#3730A3]'
                  : 'border-[#E5E1D8] text-[#555] hover:bg-[#FAFAF7]'
              }`}
            >
              {filterLabels[f]}
              <span className={`font-mono text-[10px] ${active ? 'text-[#4F46E5]' : 'text-[#888]'}`}>
                {count}
              </span>
            </button>
          )
        })}
        {completedTasks.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className="ml-auto rounded-full border border-[#E5E1D8] px-3 py-1 text-[12px] text-[#555] hover:bg-[#FAFAF7]"
          >
            {showCompleted ? 'Ukryj ukończone' : `Pokaż ukończone (${completedTasks.length})`}
          </button>
        )}
      </div>

      {/* New task dialog (otwierany з URL ?new=1 lub з Header) */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowe zadanie</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="title">Tytul *</FieldLabel>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="due">Termin</FieldLabel>
                    <Input
                      id="due"
                      type="date"
                      value={formData.due}
                      onChange={(e) => setFormData({ ...formData, due: e.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="time">Godzina</FieldLabel>
                    <Input
                      id="time"
                      type="time"
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="priority">Priorytet</FieldLabel>
                    <Select
                      value={formData.priority}
                      onValueChange={(value) => setFormData({ ...formData, priority: value as Task['priority'] })}
                    >
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_PRIORITIES.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sphere">Sfera</FieldLabel>
                    <Select
                      value={formData.sphere}
                      onValueChange={(value) => setFormData({ ...formData, sphere: value as Task['sphere'] })}
                    >
                      <SelectTrigger id="sphere">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_SPHERES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="client">Klient (opcjonalnie)</FieldLabel>
                  <Select
                    value={formData.client_id || '__none__'}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        client_id: value === '__none__' ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger id="client">
                      <SelectValue placeholder="Wybierz klienta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Brak</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="goal">Cel (opcjonalnie)</FieldLabel>
                  <Select
                    value={formData.goal_id || '__none__'}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        goal_id: value === '__none__' ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger id="goal">
                      <SelectValue placeholder="Wybierz cel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Brak</SelectItem>
                      {goals.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Anuluj
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? <Spinner className="mr-2" /> : null}
                  Dodaj
                </Button>
              </div>
            </form>
          </DialogContent>
      </Dialog>

      {/* Filtered task list */}
      {filteredTasks.length > 0 ? (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      ) : (
        // Sprint S4 Phase 4B — action-oriented empty state
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border-2 border-[#E5E1D8] text-[#888]">
              <span className="text-xl">○</span>
            </div>
            <div>
              <h3 className="text-[16px] font-medium">{emptyMessage[filter]}</h3>
              {hotLeads.length > 0 ? (
                <p className="mt-1 text-[13px] text-[#555]">
                  Co dalej? Skorzystaj z hot leadów и zaplanuj kontakt.
                </p>
              ) : (
                <p className="mt-1 text-[13px] text-[#888]">
                  Wszystko zrobione na ten filtr.
                </p>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {topHotLead && (
                <Button size="sm" asChild>
                  <Link
                    href={`/organizer?tab=zadania&new=1&client_id=${topHotLead.id}`}
                  >
                    <PlusIcon className="mr-1.5 size-3.5" />
                    Zaplanuj kontakt z hot leadem
                  </Link>
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                <PlusIcon className="mr-1.5 size-3.5" />
                Nowe zadanie
              </Button>
            </div>
            {hotLeads.length > 0 && (
              <div className="mt-3">
                <HotLeadyChips leads={hotLeads.slice(0, 3)} compact />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Completed list (toggle) */}
      {showCompleted && completedTasks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[10px] uppercase tracking-wider text-[#888]">
            Ukończone ({completedTasks.length})
          </h3>
          {completedTasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
