// components/dzis/calendar-types.ts
// Sprint S4 Phase 3 — shared types для SplitFocusView i TimeGridView.

export type EventSeverity = 'urgent' | 'progress' | 'planned' | 'done'

export interface CalendarEvent {
  id: string
  title: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM, або null дla all-day */
  time: string | null
  severity: EventSeverity
  href?: string
  badge?: string | null
}

export const SEVERITY_COLORS: Record<EventSeverity, { bg: string; border: string; text: string; dot: string }> = {
  urgent: { bg: 'bg-[#FEE2E2]', border: 'border-l-[#DC2626]', text: 'text-[#991B1B]', dot: 'bg-[#DC2626]' },
  progress: { bg: 'bg-[#EEEDFE]', border: 'border-l-[#4F46E5]', text: 'text-[#3730A3]', dot: 'bg-[#4F46E5]' },
  planned: { bg: 'bg-[#F0EDE5]', border: 'border-l-[#888]', text: 'text-[#555]', dot: 'bg-[#888]' },
  done: { bg: 'bg-[#D1FAE5]', border: 'border-l-[#00A656]', text: 'text-[#065F46]', dot: 'bg-[#00A656]' },
}

export const HOUR_START = 8
export const HOUR_END = 22
