'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import type { Goal } from '@/lib/types'
import { PlusIcon, MoreHorizontalIcon, PencilIcon, TrashIcon, TargetIcon } from 'lucide-react'

interface GoalsContentProps {
  goals: Goal[]
}

export function GoalsContent({ goals: initialGoals }: GoalsContentProps) {
  const [goals, setGoals] = useState(initialGoals)
  const [open, setOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    sphere: '',
    deadline: '',
    target: '100',
    current: '0',
    unit: '',
  })
  const router = useRouter()
  const supabase = createClient()

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      sphere: '',
      deadline: '',
      target: '100',
      current: '0',
      unit: '',
    })
    setEditingGoal(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const payload = {
      title: formData.title,
      description: formData.description || null,
      sphere: formData.sphere || null,
      deadline: formData.deadline || null,
      target: parseFloat(formData.target) || 100,
      current: parseFloat(formData.current) || 0,
      unit: formData.unit || null,
    }

    if (editingGoal) {
      const { data, error } = await supabase
        .from('goals')
        .update(payload)
        .eq('id', editingGoal.id)
        .select()
        .single()

      if (!error && data) {
        setGoals(goals.map((g) => (g.id === data.id ? data : g)))
      }
    } else {
      const { data, error } = await supabase
        .from('goals')
        .insert({ ...payload, owner_id: user.id })
        .select()
        .single()

      if (!error && data) {
        setGoals([data, ...goals])
      }
    }

    setLoading(false)
    setOpen(false)
    resetForm()
    router.refresh()
  }

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal)
    setFormData({
      title: goal.title,
      description: goal.description || '',
      sphere: goal.sphere || '',
      deadline: goal.deadline || '',
      target: goal.target.toString(),
      current: goal.current.toString(),
      unit: goal.unit || '',
    })
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunac ten cel?')) return

    const { error } = await supabase.from('goals').delete().eq('id', id)
    if (!error) {
      setGoals(goals.filter((g) => g.id !== id))
      router.refresh()
    }
  }

  const handleUpdateProgress = async (goalId: string, newCurrent: number) => {
    const { error } = await supabase
      .from('goals')
      .update({ current: newCurrent })
      .eq('id', goalId)

    if (!error) {
      setGoals(goals.map((g) => (g.id === goalId ? { ...g, current: newCurrent } : g)))
      router.refresh()
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen)
          if (!isOpen) resetForm()
        }}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon className="mr-2 size-4" />
              Nowy cel
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingGoal ? 'Edytuj cel' : 'Nowy cel'}</DialogTitle>
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
                <Field>
                  <FieldLabel htmlFor="description">Opis</FieldLabel>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="sphere">Sfera</FieldLabel>
                    <Input
                      id="sphere"
                      value={formData.sphere}
                      onChange={(e) => setFormData({ ...formData, sphere: e.target.value })}
                      placeholder="np. praca, zdrowie"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="deadline">Termin</FieldLabel>
                    <Input
                      id="deadline"
                      type="date"
                      value={formData.deadline}
                      onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field>
                    <FieldLabel htmlFor="target">Cel</FieldLabel>
                    <Input
                      id="target"
                      type="number"
                      value={formData.target}
                      onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="current">Aktualnie</FieldLabel>
                    <Input
                      id="current"
                      type="number"
                      value={formData.current}
                      onChange={(e) => setFormData({ ...formData, current: e.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="unit">Jednostka</FieldLabel>
                    <Input
                      id="unit"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      placeholder="np. %, szt, km"
                    />
                  </Field>
                </div>
              </FieldGroup>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Anuluj
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? <Spinner className="mr-2" /> : null}
                  {editingGoal ? 'Zapisz' : 'Dodaj'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nie masz jeszcze zadnych celow. Dodaj swoj pierwszy cel!
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => {
            const progress = goal.target > 0 ? (goal.current / goal.target) * 100 : 0
            const isCompleted = progress >= 100

            return (
              <Card key={goal.id} className={isCompleted ? 'border-green-500' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <TargetIcon className={`size-5 ${isCompleted ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <CardTitle className="text-base">{goal.title}</CardTitle>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontalIcon className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(goal)}>
                          <PencilIcon className="mr-2 size-4" />
                          Edytuj
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(goal.id)}>
                          <TrashIcon className="mr-2 size-4" />
                          Usun
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  {goal.description && (
                    <p className="text-sm text-muted-foreground mb-4">{goal.description}</p>
                  )}
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Postep</span>
                      <span className="font-medium">
                        {goal.current} / {goal.target} {goal.unit}
                      </span>
                    </div>
                    <Progress value={Math.min(progress, 100)} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{Math.round(progress)}%</span>
                      {goal.deadline && <span>Termin: {new Date(goal.deadline).toLocaleDateString('pl-PL')}</span>}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateProgress(goal.id, goal.current + 1)}
                        className="flex-1"
                      >
                        +1
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateProgress(goal.id, goal.current + 5)}
                        className="flex-1"
                      >
                        +5
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateProgress(goal.id, goal.current + 10)}
                        className="flex-1"
                      >
                        +10
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
