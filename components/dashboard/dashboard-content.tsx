'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertCircleIcon,
  CalendarIcon,
  CheckCircleIcon,
  PhoneIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  ClockIcon,
} from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

import { createClient } from '@/lib/supabase/client'
import type { Deal, DealStage } from '@/lib/types'
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

interface DashboardContentProps {
  today: string
  callToday: DealRow[]
  openDeals: AggregateDeal[]
  wonThisMonth: AggregateDeal[]
  lostThisMonth: AggregateDeal[]
  noNextAction: DealRow[]
  stale: DealRow[]
  stuckNegotiation: DealRow[]
  closingSoon: DealRow[]
}

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

function StageBadge({ stage }: { stage: DealStage }) {
  return (
    <Badge variant="outline" className={cn('border-transparent', stageBadgeColors[stage])}>
      {stageLabels[stage]}
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

interface MarkDoneState {
  deal: DealRow
  next_action_date: string
  stage: DealStage
  comment: string
}

function MarkDoneModal({
  state,
  onOpenChange,
  onSaved,
}: {
  state: MarkDoneState
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [next_action_date, setNextDate] = useState('')
  const [stage, setStage] = useState<DealStage>(state.deal.stage)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Sesja wygasła')
      setSubmitting(false)
      return
    }

    const stageChanged = stage !== state.deal.stage

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      next_action_date: next_action_date || null,
      next_action_note: null,
    }
    if (stageChanged) updatePayload.stage = stage

    const { error: updateError } = await supabase
      .from('deals')
      .update(updatePayload)
      .eq('id', state.deal.id)

    if (updateError) {
      toast.error(`Nie zapisano: ${updateError.message}`)
      setSubmitting(false)
      return
    }

    if (stageChanged) {
      await supabase.from('deal_events').insert({
        deal_id: state.deal.id,
        event_type: 'stage_change',
        from_stage: state.deal.stage,
        to_stage: stage,
        comment: comment.trim() || null,
        owner_id: user.id,
      })
    } else if (comment.trim()) {
      await supabase.from('deal_events').insert({
        deal_id: state.deal.id,
        event_type: 'note',
        comment: comment.trim(),
        owner_id: user.id,
      })
    }

    toast.success('Zapisano akcję')
    onSaved()
    setSubmitting(false)
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Akcja wykonana</DialogTitle>
          <DialogDescription>
            {dealHeading(state.deal)}
            {state.deal.client && ` — ${state.deal.client.title}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="next_action_date">Następna akcja — data</Label>
            <Input
              id="next_action_date"
              type="date"
              value={next_action_date}
              onChange={(e) => setNextDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Zostaw puste, żeby skasować zaplanowaną akcję.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage">Etap</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as DealStage)}>
              <SelectTrigger id="stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEAL_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment">Komentarz</Label>
            <Textarea
              id="comment"
              rows={3}
              placeholder="Co wynikło z rozmowy / spotkania..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner className="mr-2" />}
              Zapisz
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  callToday,
  openDeals,
  wonThisMonth,
  lostThisMonth,
  noNextAction,
  stale,
  stuckNegotiation,
  closingSoon,
}: DashboardContentProps) {
  const [markDoneState, setMarkDoneState] = useState<MarkDoneState | null>(null)

  const sortedCallToday = useMemo(
    () =>
      [...callToday].sort((a, b) => {
        const aDate = a.next_action_date ?? ''
        const bDate = b.next_action_date ?? ''
        return aDate.localeCompare(bDate)
      }),
    [callToday],
  )

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

  const closeMarkDone = () => setMarkDoneState(null)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Section 1: Zadzwoń dziś */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneIcon className="size-5" />
            Zadzwoń dziś
          </CardTitle>
          <CardDescription>
            {sortedCallToday.length === 0
              ? 'Brak zaplanowanych akcji na dzisiaj.'
              : `${sortedCallToday.length} ${
                  sortedCallToday.length === 1 ? 'umowa' : 'umów'
                } czeka na akcję.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedCallToday.length > 0 && (
            <ul className="divide-y">
              {sortedCallToday.map((deal) => {
                const overdue = deal.next_action_date
                  ? daysBetween(today, deal.next_action_date) < 0
                  : false
                return (
                  <li key={deal.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/deals/${deal.id}`}
                        className="flex-1 min-w-0 hover:underline"
                      >
                        <p className="text-sm font-medium truncate">
                          {dealHeading(deal)}
                        </p>
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
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={cn(
                            'flex items-center gap-1',
                            overdue
                              ? 'text-destructive font-medium'
                              : 'text-muted-foreground',
                          )}
                        >
                          <CalendarIcon className="size-3" />
                          {deal.next_action_date &&
                            formatRelativeDay(deal.next_action_date, today)}
                        </span>
                        {deal.next_action_note && (
                          <span className="text-muted-foreground italic line-clamp-1">
                            — {deal.next_action_note}
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setMarkDoneState({
                            deal,
                            next_action_date: '',
                            stage: deal.stage,
                            comment: '',
                          })
                        }
                      >
                        <CheckCircleIcon className="mr-2 size-3.5" />
                        Wykonano
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
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

      {/* Section 3: Wymagają uwagi */}
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

      {/* Section 4: Najbliższe 7 dni */}
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

      {markDoneState && (
        <MarkDoneModal
          key={markDoneState.deal.id}
          state={markDoneState}
          onOpenChange={(open) => {
            if (!open) closeMarkDone()
          }}
          onSaved={closeMarkDone}
        />
      )}
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
