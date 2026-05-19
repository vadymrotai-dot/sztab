// components/operacje/order-detail.tsx
// Sprint S-ORDER.1.C.2 (19.05.2026) — admin order detail з status change + internal notes.

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type OrderStatus =
  | 'draft'
  | 'submitted'
  | 'confirmed'
  | 'in_realization'
  | 'shipped'
  | 'invoiced'
  | 'cancelled'

type Tier = 'maly' | 'sredni' | 'duzy'

type Item = {
  id: string
  product_name_snapshot: string
  gramatura_snapshot: string | null
  qty: number
  unit_price: number
  line_total: number
}

type Order = {
  id: string
  order_number: string
  status: OrderStatus
  tier_at_submit: Tier | null
  total_net: number
  total_vat: number
  total_brutto: number
  vat_rate: number
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
  delivery_address: string | null
  preferred_delivery_date: string | null
  customer_notes: string | null
  internal_notes: string | null
  created_at: string
  link_opened_at: string | null
  submitted_at: string | null
  confirmed_at: string | null
  updated_at: string
  access_token: string
  client: {
    id: string
    title: string
    nip: string | null
    city: string | null
    address: string | null
    region: string | null
  }
  items: Item[]
}

const STATUS_INFO: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'Szkic', color: 'text-slate-700', bg: 'bg-slate-100' },
  submitted: { label: 'Złożone', color: 'text-amber-900', bg: 'bg-amber-100' },
  confirmed: { label: 'Potwierdzone', color: 'text-blue-900', bg: 'bg-blue-100' },
  in_realization: { label: 'W realizacji', color: 'text-indigo-900', bg: 'bg-indigo-100' },
  shipped: { label: 'Wysłane', color: 'text-emerald-900', bg: 'bg-emerald-100' },
  invoiced: { label: 'Zafakturowane', color: 'text-emerald-900', bg: 'bg-emerald-200' },
  cancelled: { label: 'Anulowane', color: 'text-rose-900', bg: 'bg-rose-100' },
}

const TIER_LABELS: Record<Tier, string> = {
  maly: 'Mały opt',
  sredni: 'Średni opt',
  duzy: 'Duży opt',
}

// Order транзиції — forward chain + cancel завжди доступно
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  draft: ['cancelled'],
  submitted: ['confirmed', 'cancelled'],
  confirmed: ['in_realization', 'cancelled'],
  in_realization: ['shipped', 'cancelled'],
  shipped: ['invoiced', 'cancelled'],
  invoiced: [],
  cancelled: [],
}

function fmt(n: number): string {
  return (
    n.toLocaleString('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' zł'
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('pl-PL') +
    ' ' +
    d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  )
}

function fmtDateOnly(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pl-PL')
}

export function OrderDetail({ order }: { order: Order }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [notes, setNotes] = useState(order.internal_notes || '')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const changeStatus = (newStatus: OrderStatus) => {
    if (!confirm(`Zmienić status na "${STATUS_INFO[newStatus].label}"?`)) return
    setStatusError(null)
    startTransition(async () => {
      const res = await fetch(`/api/orders/admin/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        setStatusError(data.error || 'Błąd zmiany statusu')
      }
    })
  }

  const saveNotes = async () => {
    setNotesSaving(true)
    setNotesSaved(false)
    const res = await fetch(`/api/orders/admin/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internal_notes: notes }),
    })
    setNotesSaving(false)
    if (res.ok) {
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    }
  }

  const status = STATUS_INFO[order.status]
  const nextStatuses = NEXT_STATUSES[order.status]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link
          href="/operacje/zamowienia"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Wszystkie zamówienia
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-mono">
            {order.order_number}
          </h1>
          <div className="text-sm text-slate-500 mt-1">
            Złożone {fmtDate(order.submitted_at || order.created_at)}
          </div>
        </div>
        <span
          className={`px-3 py-1.5 rounded-full text-sm font-semibold ${status.bg} ${status.color}`}
        >
          {status.label}
        </span>
      </div>

      {statusError && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-900 text-sm px-4 py-2 rounded-lg">
          {statusError}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column — items + notes */}
        <div className="lg:col-span-2 space-y-4">
          {/* Items */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h2 className="font-semibold text-slate-900">Pozycje zamówienia</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">Produkt</th>
                  <th className="px-4 py-2 text-right">Ilość</th>
                  <th className="px-4 py-2 text-right">Cena</th>
                  <th className="px-4 py-2 text-right">Suma</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <div className="text-slate-900">{item.product_name_snapshot}</div>
                      {item.gramatura_snapshot && (
                        <div className="text-xs text-slate-500">
                          {item.gramatura_snapshot}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      {item.qty} szt
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {fmt(Number(item.unit_price))}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {fmt(Number(item.line_total))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-2 text-right text-sm text-slate-600"
                  >
                    Suma netto
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-slate-900">
                    {fmt(Number(order.total_net))}
                  </td>
                </tr>
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-2 text-right text-sm text-slate-600"
                  >
                    VAT 5%
                  </td>
                  <td className="px-4 py-2 text-right text-slate-700">
                    {fmt(Number(order.total_vat))}
                  </td>
                </tr>
                <tr className="border-t border-slate-300">
                  <td
                    colSpan={3}
                    className="px-4 py-3 text-right font-bold text-slate-900"
                  >
                    Razem brutto
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-lg text-slate-900">
                    {fmt(Number(order.total_brutto))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Customer notes (від клієнта, read-only) */}
          {order.customer_notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-2">
                Uwagi od klienta
              </div>
              <p className="text-sm text-slate-900 whitespace-pre-wrap">
                {order.customer_notes}
              </p>
            </div>
          )}

          {/* Internal notes (твої, editable) */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Notatki wewnętrzne (klient nie widzi)
              </div>
              <div className="flex items-center gap-2">
                {notesSaved && (
                  <span className="text-xs text-emerald-700">✓ Zapisano</span>
                )}
                <button
                  onClick={saveNotes}
                  disabled={notesSaving}
                  className="text-xs px-3 py-1 bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
                >
                  {notesSaving ? 'Zapisywanie...' : 'Zapisz'}
                </button>
              </div>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Np. dzwonić w czwartek po 14:00, klient prosił o..."
              className="w-full text-sm border border-slate-300 rounded p-2 focus:outline-none focus:border-slate-900"
            />
          </div>
        </div>

        {/* Right column — actions + meta */}
        <div className="space-y-4">
          {/* Status actions */}
          {nextStatuses.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
                Następne kroki
              </div>
              <div className="space-y-2">
                {nextStatuses.map((s) => {
                  const info = STATUS_INFO[s]
                  const isPrimary = s !== 'cancelled'
                  return (
                    <button
                      key={s}
                      onClick={() => changeStatus(s)}
                      disabled={isPending}
                      className={`w-full px-3 py-2 rounded-lg text-sm font-semibold transition ${
                        isPrimary
                          ? 'bg-slate-900 text-white hover:bg-slate-800'
                          : 'bg-white text-rose-700 border border-rose-300 hover:bg-rose-50'
                      } disabled:opacity-50`}
                    >
                      {isPrimary ? '→ ' : '✗ '}
                      {info.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Client info */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Klient
            </div>
            <Link
              href={`/clients/${order.client.id}`}
              className="font-semibold text-slate-900 hover:text-amber-700 block"
            >
              {order.client.title}
            </Link>
            {order.client.nip && (
              <div className="text-xs text-slate-600 font-mono mt-1">
                NIP {order.client.nip}
              </div>
            )}
            {order.client.city && (
              <div className="text-xs text-slate-600 mt-1">{order.client.city}</div>
            )}
          </div>

          {/* Contact */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Kontakt
            </div>
            {order.contact_person && (
              <div className="text-sm text-slate-900 font-medium">
                {order.contact_person}
              </div>
            )}
            {order.contact_phone && (
              <a
                href={`tel:${order.contact_phone}`}
                className="text-sm text-blue-700 hover:underline block mt-1"
              >
                {order.contact_phone}
              </a>
            )}
            {order.contact_email && (
              <a
                href={`mailto:${order.contact_email}`}
                className="text-sm text-blue-700 hover:underline block mt-1 break-all"
              >
                {order.contact_email}
              </a>
            )}
          </div>

          {/* Delivery */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Dostawa
            </div>
            {order.delivery_address && (
              <div className="text-sm text-slate-900 whitespace-pre-wrap">
                {order.delivery_address}
              </div>
            )}
            {order.preferred_delivery_date && (
              <div className="text-xs text-slate-600 mt-2">
                Preferowana data:{' '}
                <strong className="text-slate-900">
                  {fmtDateOnly(order.preferred_delivery_date)}
                </strong>
              </div>
            )}
          </div>

          {/* Order meta */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs text-slate-600 space-y-1">
            {order.tier_at_submit && (
              <div>
                Tier:{' '}
                <span className="text-slate-900 font-medium">
                  {TIER_LABELS[order.tier_at_submit]}
                </span>
              </div>
            )}
            <div>
              Link otwarty:{' '}
              <span className="text-slate-900">{fmtDate(order.link_opened_at)}</span>
            </div>
            <div>
              Złożone: <span className="text-slate-900">{fmtDate(order.submitted_at)}</span>
            </div>
            {order.confirmed_at && (
              <div>
                Potwierdzone:{' '}
                <span className="text-slate-900">{fmtDate(order.confirmed_at)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-200 mt-2">
              <div>
                Token:{' '}
                <span className="font-mono text-slate-700">
                  {order.access_token.substring(0, 8)}...
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
