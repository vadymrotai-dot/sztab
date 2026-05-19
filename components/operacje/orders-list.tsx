// components/operacje/orders-list.tsx
// Sprint S-ORDER.1.C.1 (19.05.2026) — client-side filtering + table render.

'use client'

import { useState, useMemo } from 'react'
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

type OrderRow = {
  id: string
  order_number: string
  status: OrderStatus
  tier_at_submit: Tier | null
  total_net: number
  total_brutto: number
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
  delivery_address: string | null
  preferred_delivery_date: string | null
  created_at: string
  submitted_at: string | null
  link_opened_at: string | null
  confirmed_at: string | null
  client: {
    id: string
    title: string
    nip: string | null
    city: string | null
  }
}

const STATUS_LABELS: Record<OrderStatus, { label: string; color: string }> = {
  draft: { label: 'Szkic', color: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'Złożone', color: 'bg-amber-100 text-amber-900' },
  confirmed: { label: 'Potwierdzone', color: 'bg-blue-100 text-blue-900' },
  in_realization: { label: 'W realizacji', color: 'bg-indigo-100 text-indigo-900' },
  shipped: { label: 'Wysłane', color: 'bg-emerald-100 text-emerald-900' },
  invoiced: { label: 'Zafakturowane', color: 'bg-emerald-200 text-emerald-900' },
  cancelled: { label: 'Anulowane', color: 'bg-rose-100 text-rose-900' },
}

const TIER_LABELS: Record<Tier, string> = {
  maly: 'Mały',
  sredni: 'Średni',
  duzy: 'Duży',
}

const ACTIVE_STATUSES: OrderStatus[] = [
  'submitted',
  'confirmed',
  'in_realization',
  'shipped',
  'invoiced',
]

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

export function OrdersList({ orders }: { orders: OrderRow[] }) {
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          o.order_number.toLowerCase().includes(q) ||
          o.client.title.toLowerCase().includes(q) ||
          (o.client.nip || '').includes(q) ||
          (o.contact_person || '').toLowerCase().includes(q) ||
          (o.contact_phone || '').includes(q)
        )
      }
      return true
    })
  }, [orders, statusFilter, search])

  // Aggregate metrics
  const submittedCount = orders.filter((o) => o.status === 'submitted').length
  const totalBrutto = orders
    .filter((o) => ACTIVE_STATUSES.includes(o.status))
    .reduce((s, o) => s + Number(o.total_brutto || 0), 0)

  const statusPills: ('all' | OrderStatus)[] = [
    'all',
    'submitted',
    'confirmed',
    'in_realization',
    'shipped',
    'invoiced',
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Zamówienia</h1>
        <div className="flex gap-6 text-sm text-slate-600">
          <div>
            Nowe: <strong className="text-amber-700">{submittedCount}</strong>
          </div>
          <div>
            Łączna wartość aktywnych:{' '}
            <strong className="text-slate-900">{fmt(totalBrutto)}</strong>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {statusPills.map((s) => {
          const count =
            s === 'all'
              ? orders.length
              : orders.filter((o) => o.status === s).length
          const label =
            s === 'all' ? `Wszystkie (${count})` : `${STATUS_LABELS[s].label} (${count})`
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                statusFilter === s
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          )
        })}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj: nr, klient, NIP, telefon..."
          className="ml-auto px-3 py-1.5 border border-slate-300 rounded-md text-sm w-72"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-500">
          <div className="text-4xl mb-2">📦</div>
          <p className="text-sm">
            Brak zamówień
            {statusFilter !== 'all' &&
              ` o statusie "${STATUS_LABELS[statusFilter].label}"`}
          </p>
          <p className="text-xs mt-1">
            Wyślij link do zamówienia klientom z cohort UC_HURT_WARZYWA_OWOCE.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                <th className="px-4 py-3">Nr / Data</th>
                <th className="px-4 py-3">Klient</th>
                <th className="px-4 py-3">Kontakt</th>
                <th className="px-4 py-3 text-right">Wartość</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Dostawa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  className="hover:bg-amber-50/40 transition"
                >
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/operacje/zamowienia/${o.id}`}
                      className="font-mono text-sm font-bold text-slate-900 hover:text-amber-700"
                    >
                      {o.order_number}
                    </Link>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {fmtDate(o.submitted_at || o.created_at)}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-slate-900">{o.client.title}</div>
                    {o.client.nip && (
                      <div className="text-xs text-slate-500 font-mono">
                        NIP {o.client.nip}
                      </div>
                    )}
                    {o.client.city && (
                      <div className="text-xs text-slate-500">{o.client.city}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {o.contact_person && (
                      <div className="text-slate-900">{o.contact_person}</div>
                    )}
                    {o.contact_phone && (
                      <div className="text-xs text-slate-600">{o.contact_phone}</div>
                    )}
                    {o.contact_email && (
                      <div className="text-xs text-slate-500 truncate max-w-[200px]">
                        {o.contact_email}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-right font-semibold text-slate-900">
                    {fmt(Number(o.total_brutto || 0))}
                    <div className="text-xs text-slate-500 font-normal">
                      netto {fmt(Number(o.total_net || 0))}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {o.tier_at_submit && (
                      <span className="text-xs text-slate-700">
                        {TIER_LABELS[o.tier_at_submit]}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${STATUS_LABELS[o.status].color}`}
                    >
                      {STATUS_LABELS[o.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-slate-600">
                    {o.preferred_delivery_date
                      ? new Date(o.preferred_delivery_date).toLocaleDateString(
                          'pl-PL',
                        )
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
