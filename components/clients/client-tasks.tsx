'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import type { Task } from '@/lib/types'
import { TASK_PRIORITIES, TASK_SPHERES } from '@/lib/types'
import { PlusIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClientTasksProps {
  clientId: string
  tasks: Task[]
}

const priorityColors: Record<string, string> = {
  low: 'text-muted-foreground',
  normal: 'text-foreground',
  high: 'text-destructive font-medium',
}

export function ClientTasks({ clientId, tasks: initialTasks }: ClientTasksProps) {
  const [tasks, setTasks] = useState(initialTasks)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    due: '',
    time: '',
    priority: 'normal' as Task['priority'],
    sphere: 'praca' as Task['sphere'],
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
        ...formData,
        due: formData.due || null,
        time: formData.time || null,
        client_id: clientId,
        owner_id: user.id,
      })
      .select()
      .single()

    if (!error && data) {
      setTasks([data, ...tasks])
    }

    setLoading(false)
    setOpen(false)
    setFormData({ title: '', due: '', time: '', priority: 'normal', sphere: 'praca' })
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

  const pendingTasks = tasks.filter((t) => !t.done)
  const completedTasks = tasks.filter((t) => t.done)

  return (
    <div>
      <div className="mb-4 flex justify-end">
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

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Brak zadan dla tego klienta
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {pendingTasks.length > 0 && (
            <div>
              <h4 className="mb-3 text-sm font-medium text-muted-foreground">Do zrobienia</h4>
              <div className="space-y-2">
                {pendingTasks.map((task) => (
                  <Card key={task.id}>
                    <CardContent className="flex items-center gap-3 py-3">
                      <Checkbox
                        checked={task.done}
                        onCheckedChange={(checked) => handleToggle(task.id, !!checked)}
                      />
                      <div className="flex-1">
                        <p className={cn('text-sm', priorityColors[task.priority])}>{task.title}</p>
                        {task.due && (
                          <p className="text-xs text-muted-foreground">
                            {task.due} {task.time && `o ${task.time}`}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          {completedTasks.length > 0 && (
            <div>
              <h4 className="mb-3 text-sm font-medium text-muted-foreground">Ukonczone</h4>
              <div className="space-y-2">
                {completedTasks.map((task) => (
                  <Card key={task.id} className="opacity-60">
                    <CardContent className="flex items-center gap-3 py-3">
                      <Checkbox
                        checked={task.done}
                        onCheckedChange={(checked) => handleToggle(task.id, !!checked)}
                      />
                      <p className="text-sm line-through">{task.title}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
