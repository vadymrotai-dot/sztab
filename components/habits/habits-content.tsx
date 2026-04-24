'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Field, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import type { Habit } from '@/lib/types'
import { PlusIcon, MoreHorizontalIcon, TrashIcon, CalendarCheckIcon, FlameIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HabitsContentProps {
  habits: Habit[]
}

function getLast30Days(): string[] {
  const days: string[] = []
  for (let i = 29; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    days.push(date.toISOString().split('T')[0])
  }
  return days
}

function getCurrentStreak(log: Record<string, boolean>): number {
  let streak = 0
  const today = new Date()
  
  for (let i = 0; i < 365; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    
    if (log[dateStr]) {
      streak++
    } else if (i > 0) {
      break
    }
  }
  
  return streak
}

export function HabitsContent({ habits: initialHabits }: HabitsContentProps) {
  const [habits, setHabits] = useState(initialHabits)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [newHabitName, setNewHabitName] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const today = new Date().toISOString().split('T')[0]
  const last30Days = useMemo(() => getLast30Days(), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHabitName.trim()) return
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('habits')
      .insert({ name: newHabitName.trim(), owner_id: user.id })
      .select()
      .single()

    if (!error && data) {
      setHabits([...habits, data])
    }

    setLoading(false)
    setOpen(false)
    setNewHabitName('')
    router.refresh()
  }

  const handleToggle = async (habitId: string, date: string, currentLog: Record<string, boolean>) => {
    const newLog = { ...currentLog, [date]: !currentLog[date] }
    
    const { error } = await supabase
      .from('habits')
      .update({ log: newLog })
      .eq('id', habitId)

    if (!error) {
      setHabits(habits.map((h) => (h.id === habitId ? { ...h, log: newLog } : h)))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunac ten nawyk?')) return

    const { error } = await supabase.from('habits').delete().eq('id', id)
    if (!error) {
      setHabits(habits.filter((h) => h.id !== id))
      router.refresh()
    }
  }

  const getDayLabel = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('pl-PL', { weekday: 'narrow' })
  }

  const getDayNumber = (dateStr: string): number => {
    return new Date(dateStr).getDate()
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon className="mr-2 size-4" />
              Nowy nawyk
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowy nawyk</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <Field>
                <FieldLabel htmlFor="name">Nazwa nawyku</FieldLabel>
                <Input
                  id="name"
                  value={newHabitName}
                  onChange={(e) => setNewHabitName(e.target.value)}
                  placeholder="np. Cwiczenia rano"
                  required
                />
              </Field>
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

      {habits.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nie masz jeszcze zadnych nawykow. Dodaj swoj pierwszy nawyk!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {habits.map((habit) => {
            const streak = getCurrentStreak(habit.log)
            const completedDays = last30Days.filter((d) => habit.log[d]).length

            return (
              <Card key={habit.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CalendarCheckIcon className="size-5 text-muted-foreground" />
                      <CardTitle className="text-base">{habit.name}</CardTitle>
                      {streak > 0 && (
                        <div className="flex items-center gap-1 text-amber-500">
                          <FlameIcon className="size-4" />
                          <span className="text-sm font-medium">{streak}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {completedDays}/30 dni
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontalIcon className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(habit.id)}>
                            <TrashIcon className="mr-2 size-4" />
                            Usun
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-1 overflow-x-auto pb-2">
                    {last30Days.map((date) => {
                      const isCompleted = habit.log[date]
                      const isToday = date === today

                      return (
                        <button
                          key={date}
                          onClick={() => handleToggle(habit.id, date, habit.log)}
                          className={cn(
                            'flex flex-col items-center justify-center min-w-[28px] h-10 rounded-md text-xs transition-colors',
                            isCompleted
                              ? 'bg-green-500 text-white'
                              : 'bg-muted hover:bg-muted/80',
                            isToday && !isCompleted && 'ring-2 ring-primary'
                          )}
                          title={date}
                        >
                          <span className="text-[10px] leading-none opacity-70">{getDayLabel(date)}</span>
                          <span className="font-medium">{getDayNumber(date)}</span>
                        </button>
                      )
                    })}
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
