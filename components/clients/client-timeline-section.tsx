'use client'

// components/clients/client-timeline-section.tsx
// Sprint TYDZIEN2.T2.6 (29.05.2026) — Historia interakcji.
// Timeline lista orderów (4 typy zdarzeń per row) + client_notes (z kind/
// occurred_at, mig 077). UNION pre-built server-side (lib/timeline/build-events).
//
// UI:
//   - kółko-kolor per kind (system order events vs user-driven notes)
//   - data + tytuł + szczegóły (order_number albo body wpisu)
//   - inline "Dodaj wpis" form: kind dropdown + datetime-local + textarea
//
// NIE zmieniamy T2.5 ClientNotesSection — żyje obok jako szczegółowy
// edit-flow dla samych notatek. T2.6 timeline jest read-mostly view
// z prostym add-form.

import { useState, useTransition } from 'react'
import {
  StickyNoteIcon,
  PhoneIcon,
  CalendarIcon,
  BellIcon,
  PlusIcon,
  Loader2Icon,
  SendHorizontalIcon,
  MailOpenIcon,
  PackageCheckIcon,
  CheckCircle2Icon,
} from 'lucide-react'

import { addClientNote } from '@/app/actions/client-notes'

import type { TimelineEvent, TimelineEventKind } from '@/lib/timeline/build-events'

interface Props {
  clientId: string
  events: TimelineEvent[]
}

// ─── Visual config per kind ──────────────────────────────────────────

interface KindStyle {
  label: string
  // Tailwind color classes — dot background + icon foreground.
  dot: string
  icon: React.ComponentType<{ className?: string }>
  /** Group hint dla copy — system order event vs user-driven note. */
  isOrderSystem: boolean
}

const KIND_STYLE: Record<TimelineEventKind, KindStyle> = {
  order_created: {
    label: 'Wysłano zaproszenie',
    dot: 'bg-amber-100 text-amber-700 ring-amber-200',
    icon: SendHorizontalIcon,
    isOrderSystem: true,
  },
  order_opened: {
    label: 'Klient otworzył link',
    dot: 'bg-sky-100 text-sky-700 ring-sky-200',
    icon: MailOpenIcon,
    isOrderSystem: true,
  },
  order_submitted: {
    label: 'Klient złożył zamówienie',
    dot: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    icon: PackageCheckIcon,
    isOrderSystem: true,
  },
  order_confirmed: {
    label: 'Potwierdzono zamówienie',
    dot: 'bg-green-200 text-green-800 ring-green-300',
    icon: CheckCircle2Icon,
    isOrderSystem: true,
  },
  note: {
    label: 'Notatka',
    dot: 'bg-slate-100 text-slate-700 ring-slate-200',
    icon: StickyNoteIcon,
    isOrderSystem: false,
  },
  call: {
    label: 'Telefon',
    dot: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
    icon: PhoneIcon,
    isOrderSystem: false,
  },
  meeting: {
    label: 'Spotkanie',
    dot: 'bg-purple-100 text-purple-700 ring-purple-200',
    icon: CalendarIcon,
    isOrderSystem: false,
  },
  order_followup: {
    label: 'Przypomnienie o zamówieniu',
    dot: 'bg-rose-100 text-rose-700 ring-rose-200',
    icon: BellIcon,
    isOrderSystem: false,
  },
}

// ─── Date format ─────────────────────────────────────────────────────

function formatTimelineDate(iso: string): string {
  // Europe/Warsaw fix dla React #418 hydration mismatch — pattern z T2-HYDRATION-FIX.
  return new Date(iso).toLocaleString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Add wpis form ───────────────────────────────────────────────────

const ADD_KIND_OPTIONS = ['note', 'call', 'meeting', 'order_followup'] as const

interface AddFormProps {
  clientId: string
  onSuccess: () => void
  onCancel: () => void
}

function AddEntryForm({ clientId, onSuccess, onCancel }: AddFormProps) {
  const [kind, setKind] = useState<(typeof ADD_KIND_OPTIONS)[number]>('note')
  // datetime-local input format: YYYY-MM-DDTHH:mm — pusty = NULL (fallback do NOW()).
  const [occurredAt, setOccurredAt] = useState<string>('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const v = body.trim()
    if (!v) {
      setError('Treść wymagana')
      return
    }
    // Convert datetime-local (YYYY-MM-DDTHH:mm) → ISO datetime z TZ offset.
    // datetime-local nie ma TZ info — user wpisuje "11:30" myśli local time.
    // new Date(local-string) interpretuje local → ISO z offsetem przeglądarki.
    // Server Zod akceptuje datetime({offset: true}) i DB TIMESTAMPTZ store UTC.
    let occurredIso: string | null = null
    if (occurredAt) {
      const d = new Date(occurredAt)
      if (Number.isNaN(d.getTime())) {
        setError('Nieprawidłowa data')
        return
      }
      occurredIso = d.toISOString()
    }
    startTransition(async () => {
      const result = await addClientNote(clientId, v, kind, occurredIso)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setBody('')
      setOccurredAt('')
      setKind('note')
      onSuccess()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded border border-[#D4D0C5] bg-[#FAFAF7] p-3 space-y-2"
    >
      <div className="text-[11px] font-medium uppercase tracking-wider text-[#888]">
        Dodaj wpis do historii
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[11px] text-[#666]" htmlFor="timeline-kind">
            Typ
          </label>
          <select
            id="timeline-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            disabled={isPending}
            className="w-full rounded border border-[#E5E1D8] bg-white px-2 py-1 text-sm focus:border-[#888] focus:outline-none"
          >
            <option value="note">Notatka</option>
            <option value="call">Telefon</option>
            <option value="meeting">Spotkanie</option>
            <option value="order_followup">Przypomnienie o zamówieniu</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-[#666]" htmlFor="timeline-occurred">
            Data zdarzenia (opcjonalna)
          </label>
          <input
            id="timeline-occurred"
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            disabled={isPending}
            className="w-full rounded border border-[#E5E1D8] bg-white px-2 py-1 text-sm focus:border-[#888] focus:outline-none"
          />
        </div>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Co się wydarzyło? Telefon, spotkanie, ustalenia..."
        rows={3}
        maxLength={5000}
        required
        autoFocus
        disabled={isPending}
        className="w-full resize-y min-h-[80px] max-h-[300px] rounded border border-[#E5E1D8] bg-white px-2 py-1 text-sm focus:border-[#888] focus:outline-none disabled:opacity-60"
      />
      {error && (
        <div className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-[#888]">{body.length} / 5000</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded border border-[#E5E1D8] bg-white px-3 py-1 text-xs font-medium text-[#555] hover:bg-[#F5F5F5] disabled:opacity-50"
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={isPending || !body.trim()}
            className="rounded bg-[#4F46E5] px-3 py-1 text-xs font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
          >
            {isPending ? 'Zapisuję...' : 'Zapisz wpis'}
          </button>
        </div>
      </div>
    </form>
  )
}

// ─── Event row ───────────────────────────────────────────────────────

interface EventRowProps {
  event: TimelineEvent
  /** Last row in list — skip connecting line below dot (T2.6 FIX 29.05.2026:
   *  was via styled-jsx :global selector targetujący Tailwind arbitrary value
   *  class — Turbopack lightningcss strict parser nie tolerował \[\# escape.
   *  Pure Tailwind conditional render = czysty fix, zero CSS surface). */
  isLast: boolean
}

function EventRow({ event, isLast }: EventRowProps) {
  const style = KIND_STYLE[event.kind] ?? KIND_STYLE.note
  const Icon = style.icon
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full ring-2 ${style.dot}`}
          title={style.label}
        >
          <Icon className="size-3.5" />
        </span>
        {/* Connecting line — wypełnia space-y poniżej dot, łączy z next event.
            Skip dla last row — inaczej linia wystaje pod ostatnim wpisem. */}
        {!isLast && (
          <span className="mt-1 w-px flex-1 bg-[#E5E1D8]" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-[#222]">{event.title}</span>
          <span className="text-[11px] text-[#888]">{formatTimelineDate(event.at)}</span>
          {event.noteCreatedAt && (
            <span
              className="text-[10px] italic text-[#AAA]"
              title={`Wpis dodano: ${formatTimelineDate(event.noteCreatedAt)}`}
            >
              (wpisano później)
            </span>
          )}
        </div>
        {event.detail && (
          <div
            className={`mt-0.5 text-xs ${
              style.isOrderSystem ? 'text-[#666]' : 'whitespace-pre-wrap text-[#444]'
            }`}
          >
            {event.detail}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main section ────────────────────────────────────────────────────

export function ClientTimelineSection({ clientId, events }: Props) {
  const [isAdding, setIsAdding] = useState(false)

  return (
    <div className="space-y-3 text-sm">
      {!isAdding && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 rounded border border-[#E5E1D8] bg-white px-2 py-0.5 text-[11px] font-medium text-[#555] hover:bg-[#F5F5F5]"
          >
            <PlusIcon className="size-3" />
            Dodaj wpis
          </button>
        </div>
      )}

      {isAdding && (
        <AddEntryForm
          clientId={clientId}
          onSuccess={() => setIsAdding(false)}
          onCancel={() => setIsAdding(false)}
        />
      )}

      {events.length === 0 && !isAdding && (
        <div className="rounded border border-dashed border-[#E5E1D8] bg-[#FAFAF7] p-4 text-center text-xs italic text-[#888]">
          Brak wpisów w historii
        </div>
      )}

      {events.length > 0 && (
        <div className="relative">
          {events.map((event, idx) => (
            <EventRow
              key={event.key}
              event={event}
              isLast={idx === events.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
