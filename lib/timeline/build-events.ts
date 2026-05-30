// lib/timeline/build-events.ts
// Sprint TYDZIEN2.T2.6 (29.05.2026) — Historia interakcji.
//
// Składa flat timeline events list z 2 sources (UNION-style):
//   1. orders → up to 4 events per row (created_at, link_opened_at,
//      submitted_at, confirmed_at) — tylko gdy odpowiedni date NOT NULL.
//   2. client_notes → 1 event per row z kind (note/call/meeting/order_followup).
//      Date = COALESCE(occurred_at, created_at).
//
// notification_log INTENCJONALNIE skipped (decision T2.6 — noisy, ~3-10 entries
// per email × N orders zalewa timeline; lepiej zakapsulować w orders rows).
//
// Sortowanie DESC za datą — najnowsze pierwsze.
//
// Server-side composition — przekazujemy SupabaseClient i clientId, zwracamy
// TimelineEvent[]. Page.tsx Promise.all-uje to obok pozostałych queries.

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────

export type TimelineEventKind =
  // Order event kinds — system-generated z orders table dates.
  | 'order_created'
  | 'order_opened'
  | 'order_submitted'
  | 'order_confirmed'
  // Note event kinds — z client_notes.kind column (T2.6 migration 077).
  | 'note'
  | 'call'
  | 'meeting'
  | 'order_followup'

export interface TimelineEvent {
  /** Stable unique key dla React list (compounded source + id + sub-key). */
  key: string
  kind: TimelineEventKind
  /** ISO timestamp — primary sort key. Already resolved (occurred_at fallback). */
  at: string
  /** Wszystkie events maja text (body dla notek, generated label dla orders). */
  title: string
  /** Optional secondary line — np. order_number dla orders, value dla notek. */
  detail?: string | null
  /** Source row id (client_notes.id albo orders.id) — dla downstream linking
   *  ("przejdź do zamówienia", "edytuj notatkę"). */
  sourceId: string
  /** Source table — 'orders' albo 'client_notes'. */
  source: 'orders' | 'client_notes'
  /** Order-specific: czy completed event (style hint w UI). */
  orderStatus?: string | null
  /** Note-specific: oryginalna data created_at gdy różna od occurred_at —
   *  UI може показać "(wpisano X, zdarzenie z Y)". */
  noteCreatedAt?: string | null
}

// ─── Raw row types z DB ──────────────────────────────────────────────

interface OrderRow {
  id: string
  order_number: string
  status: string
  created_at: string
  link_opened_at: string | null
  submitted_at: string | null
  confirmed_at: string | null
}

interface NoteRow {
  id: string
  body: string
  kind: string
  occurred_at: string | null
  created_at: string
  updated_at: string
}

// ─── Builders ────────────────────────────────────────────────────────

function buildOrderEvents(o: OrderRow): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const detailLabel = `Zamówienie ${o.order_number}`

  // order_created — zawsze (NOT NULL na schemacie)
  events.push({
    key: `o:${o.id}:created`,
    kind: 'order_created',
    at: o.created_at,
    title: 'Wysłano zaproszenie do zamówienia',
    detail: detailLabel,
    sourceId: o.id,
    source: 'orders',
    orderStatus: o.status,
  })

  if (o.link_opened_at) {
    events.push({
      key: `o:${o.id}:opened`,
      kind: 'order_opened',
      at: o.link_opened_at,
      title: 'Klient otworzył link',
      detail: detailLabel,
      sourceId: o.id,
      source: 'orders',
      orderStatus: o.status,
    })
  }

  if (o.submitted_at) {
    events.push({
      key: `o:${o.id}:submitted`,
      kind: 'order_submitted',
      at: o.submitted_at,
      title: 'Klient złożył zamówienie',
      detail: detailLabel,
      sourceId: o.id,
      source: 'orders',
      orderStatus: o.status,
    })
  }

  if (o.confirmed_at) {
    events.push({
      key: `o:${o.id}:confirmed`,
      kind: 'order_confirmed',
      at: o.confirmed_at,
      title: 'Potwierdzono zamówienie',
      detail: detailLabel,
      sourceId: o.id,
      source: 'orders',
      orderStatus: o.status,
    })
  }

  return events
}

const NOTE_TITLE: Record<string, string> = {
  note: 'Notatka',
  call: 'Rozmowa telefoniczna',
  meeting: 'Spotkanie',
  order_followup: 'Przypomnienie o zamówieniu',
}

function buildNoteEvent(n: NoteRow): TimelineEvent {
  // Migration 077: kind DEFAULT 'note', occurred_at NULLABLE.
  // Resolved date = occurred_at || created_at.
  const at = n.occurred_at ?? n.created_at
  // T2.6 kind enum guard — fallback do 'note' jeśli stara nota (przed 077 apply)
  // ma kind NULL albo nieznaną wartość. Defense in depth + production safety.
  const kindResolved: TimelineEventKind =
    n.kind === 'call' || n.kind === 'meeting' || n.kind === 'order_followup'
      ? (n.kind as TimelineEventKind)
      : 'note'

  return {
    key: `n:${n.id}`,
    kind: kindResolved,
    at,
    title: NOTE_TITLE[kindResolved] ?? 'Notatka',
    detail: n.body,
    sourceId: n.id,
    source: 'client_notes',
    // Track gdy occurred_at != created_at — UI badge "wpisano X, zdarzenie z Y".
    noteCreatedAt: n.occurred_at && n.occurred_at !== n.created_at ? n.created_at : null,
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Build timeline events list dla klienta — orders + client_notes,
 * posortowane DESC za datą.
 *
 * Argument supabase może być anon-cookie based (T2.6 client_notes ma RLS
 * auth.uid()=owner_id) ALBO admin client jak dla orders (orders ma RLS deny
 * w mig 069 Option B, czytamy tylko z service-role).
 *
 * Pattern: caller fetchuje obu klientów (anon + admin) raz, składa results.
 * Tutaj otrzymujemy uśrednioną tablicę rows + składamy events.
 */
export function buildTimelineEvents(input: {
  orders: OrderRow[]
  notes: NoteRow[]
}): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const o of input.orders) {
    events.push(...buildOrderEvents(o))
  }
  for (const n of input.notes) {
    events.push(buildNoteEvent(n))
  }
  // DESC sort — newest first. ISO timestamp string compare = correct.
  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return events
}

/**
 * Zbiorcze fetch + build helper — przyjmuje 2 instances supabase
 * (anon dla client_notes RLS, admin dla orders).
 */
export async function fetchTimelineEvents(
  clientId: string,
  anonSupabase: SupabaseClient,
  adminSupabase: SupabaseClient,
): Promise<TimelineEvent[]> {
  const [{ data: ordersData }, { data: notesData }] = await Promise.all([
    adminSupabase
      .from('orders')
      .select('id, order_number, status, created_at, link_opened_at, submitted_at, confirmed_at')
      .eq('client_id', clientId),
    anonSupabase
      .from('client_notes')
      .select('id, body, kind, occurred_at, created_at, updated_at')
      .eq('client_id', clientId),
  ])

  return buildTimelineEvents({
    orders: (ordersData ?? []) as OrderRow[],
    notes: (notesData ?? []) as NoteRow[],
  })
}
