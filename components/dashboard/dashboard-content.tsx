'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import type { Task, Deal, Habit } from '@/lib/types'
import { UsersIcon, HandshakeIcon, TrophyIcon, CheckCircleIcon, AlertCircleIcon, ClockIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface DashboardContentProps {
  todayTasks: (Task & { client?: { id: string; title: string } | null })[]
  overdueTasks: (Task & { client?: { id: string; title: string } | null })[]
  recentDeals: (Deal & { client?: { id: string; title: string } | null })[]
  habits: Habit[]
  stats: {
    totalClients: number
    activeDeals: number
    wonDealsValue: number
    completedTasksThisMonth: number
  }
}

const stageColors: Record<string, string> = {
  lead: 'bg-slate-500',
  oferta: 'bg-blue-500',
  negocjacje: 'bg-amber-500',
  wygrana: 'bg-green-500',
  przegrana: 'bg-red-500',
}

const priorityColors: Record<string, string> = {
  low: 'text-muted-foreground',
  normal: 'text-foreground',
  high: 'text-destructive font-medium',
}

export function DashboardContent({
  todayTasks: initialTodayTasks,
  overdueTasks: initialOverdueTasks,
  recentDeals,
  habits: initialHabits,
  stats,
}: DashboardContentProps) {
  const [todayTasks, setTodayTasks] = useState(initialTodayTasks)
  const [overdueTasks, setOverdueTasks] = useState(initialOverdueTasks)
  const [habits, setHabits] = useState(initialHabits)
  const router = useRouter()
  const supabase = createClient()

  const today = new Date().toISOString().split('T')[0]

  const handleTaskComplete = async (taskId: string, isOverdue: boolean) => {
    const { error } = await supabase
      .from('tasks')
      .update({ done: true, completed_at: today })
      .eq('id', taskId)

    if (!error) {
      if (isOverdue) {
        setOverdueTasks(overdueTasks.filter((t) => t.id !== taskId))
      } else {
        setTodayTasks(todayTasks.filter((t) => t.id !== taskId))
      }
      router.refresh()
    }
  }

  const handleHabitToggle = async (habitId: string, currentLog: Record<string, boolean>) => {
    const newLog = { ...currentLog, [today]: !currentLog[today] }
    const { error } = await supabase
      .from('habits')
      .update({ log: newLog })
      .eq('id', habitId)

    if (!error) {
      setHabits(habits.map((h) => (h.id === habitId ? { ...h, log: newLog } : h)))
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      minimumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Klienci</CardTitle>
            <UsersIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClients}</div>
            <p className="text-xs text-muted-foreground">Wszystkich klientow</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Aktywne umowy</CardTitle>
            <HandshakeIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeDeals}</div>
            <p className="text-xs text-muted-foreground">W trakcie</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Wygrane</CardTitle>
            <TrophyIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.wonDealsValue)}</div>
            <p className="text-xs text-muted-foreground">Wartosc wygranych umow</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Zadania</CardTitle>
            <CheckCircleIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedTasksThisMonth}</div>
            <p className="text-xs text-muted-foreground">Ukonczonych w tym miesiacu</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClockIcon className="size-5" />
              Zadania na dzis
            </CardTitle>
            <CardDescription>
              {todayTasks.length} {todayTasks.length === 1 ? 'zadanie' : 'zadan'} do wykonania
            </CardDescription>
          </CardHeader>
          <CardContent>
            {todayTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak zadan na dzis</p>
            ) : (
              <ul className="space-y-3">
                {todayTasks.map((task) => (
                  <li key={task.id} className="flex items-start gap-3">
                    <Checkbox
                      checked={task.done}
                      onCheckedChange={() => handleTaskComplete(task.id, false)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm', priorityColors[task.priority])}>
                        {task.title}
                      </p>
                      {task.client && (
                        <p className="text-xs text-muted-foreground truncate">
                          {task.client.title}
                        </p>
                      )}
                    </div>
                    {task.time && (
                      <span className="text-xs text-muted-foreground">{task.time}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="ghost" className="mt-4 w-full">
              <Link href="/tasks">Zobacz wszystkie zadania</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Overdue Tasks */}
        <Card className={overdueTasks.length > 0 ? 'border-destructive/50' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircleIcon className="size-5" />
              Zaległe zadania
            </CardTitle>
            <CardDescription>
              {overdueTasks.length} {overdueTasks.length === 1 ? 'zadanie' : 'zadan'} po terminie
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overdueTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak zaległych zadan</p>
            ) : (
              <ul className="space-y-3">
                {overdueTasks.slice(0, 5).map((task) => (
                  <li key={task.id} className="flex items-start gap-3">
                    <Checkbox
                      checked={task.done}
                      onCheckedChange={() => handleTaskComplete(task.id, true)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{task.title}</p>
                      {task.client && (
                        <p className="text-xs text-muted-foreground truncate">
                          {task.client.title}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-destructive">{task.due}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent Deals */}
        <Card>
          <CardHeader>
            <CardTitle>Ostatnie umowy</CardTitle>
            <CardDescription>Aktywne szanse sprzedazowe</CardDescription>
          </CardHeader>
          <CardContent>
            {recentDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak aktywnych umow</p>
            ) : (
              <ul className="space-y-3">
                {recentDeals.map((deal) => (
                  <li key={deal.id} className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{deal.title}</p>
                      {deal.client && (
                        <p className="text-xs text-muted-foreground truncate">
                          {deal.client.title}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatCurrency(deal.amount)}
                      </span>
                      <Badge variant="secondary" className={cn('text-white', stageColors[deal.stage])}>
                        {deal.stage}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="ghost" className="mt-4 w-full">
              <Link href="/deals">Zobacz wszystkie umowy</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Habits */}
        <Card>
          <CardHeader>
            <CardTitle>Nawyki</CardTitle>
            <CardDescription>Sledz swoje codzienne nawyki</CardDescription>
          </CardHeader>
          <CardContent>
            {habits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak nawykow do sledzenia</p>
            ) : (
              <ul className="space-y-3">
                {habits.map((habit) => (
                  <li key={habit.id} className="flex items-center gap-3">
                    <Checkbox
                      checked={habit.log[today] || false}
                      onCheckedChange={() => handleHabitToggle(habit.id, habit.log)}
                    />
                    <span className="text-sm">{habit.name}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="ghost" className="mt-4 w-full">
              <Link href="/habits">Zarzadzaj nawykami</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
