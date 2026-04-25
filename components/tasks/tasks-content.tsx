'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
}

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

export function TasksContent({ tasks: initialTasks, clients, goals }: TasksContentProps) {
  const [tasks, setTasks] = useState(initialTasks)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
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
  const upcomingTasks = pendingTasks.filter((t) => !t.due || t.due > today)

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

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon className="mr-2 size-4" />
              Nowe zadanie
            </Button>
          </DialogTrigger>
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
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Do zrobienia ({pendingTasks.length})</TabsTrigger>
          <TabsTrigger value="completed">Ukonczone ({completedTasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4 space-y-6">
          {overdueTasks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-destructive mb-3">Zaległe ({overdueTasks.length})</h3>
              <div className="space-y-2">
                {overdueTasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}
          {todayTasks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Dzisiaj ({todayTasks.length})</h3>
              <div className="space-y-2">
                {todayTasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}
          {upcomingTasks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Nadchodzace ({upcomingTasks.length})</h3>
              <div className="space-y-2">
                {upcomingTasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}
          {pendingTasks.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Brak zadan do wykonania</p>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          {completedTasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Brak ukonczonych zadan</p>
          ) : (
            <div className="space-y-2">
              {completedTasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
