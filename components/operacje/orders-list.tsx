// components/operacje/orders-list.tsx
// Sprint S-ORDER.1.C.1 (19.05.2026) — client-side filtering + table render.
// Sprint T-ORDER.2 (30.05.2026) — sortable headers + cancelled pill + inline delete.

'use client'

import { useState, useMemo } from 'react'
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

// Sprint S-CENNIK-WH.1 (26.05.2026) — wielki_hurt 4-й tier.
// Sprint S-CENNIK-WH.2 (26.05.2026) — wielki_hurt_entry 5-й tier.
type Tier = 'maly' | 'sredni' | 'duzy' | 'wielki_hurt' | 'wielki_hurt_entry'

type OrderRow = {
  id: string
  order_number: string
  status: OrderStatus
  tier_at_submit: Tier | null
  // Sprint S-CENNIK-WH.1/WH.2 — locked at offer-send (matrix 2x2)
  cennik_tier?: 'standard' | 'wielki_hurt' | null
  price_mode?: 'auto' | 'minimum' | null
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
  wielki_hurt: 'WH',
  wielki_hurt_entry: 'WH·Hurt',
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
    d.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }) +
    ' ' +
    d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })
  )
}

// Sprint T-ORDER.2 — sort config. Order statusu dla "Status" sortowania = ten
// sam co flow lifecycle: draft → submitted → confirmed → in_realization →
// shipped → invoiced → cancelled. Pozwala posortować "od najwcześniejszego
// etapu" / "od najpóźniejszego" sensownie zamiast alfabetycznie.
const STATUS_ORDER: Record<OrderStatus, number> = {
  draft: 0,
  submitted: 1,
  confirmed: 2,
  in_realization: 3,
  shipped: 4,
  invoiced: 5,
  cancelled: 6,
}

type SortBy = 'number' | 'client' | 'value' | 'status'
type SortDir = 'asc' | 'desc'

export function OrdersList({ orders }: { orders: OrderRow[] }) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all')
  const [search, setSearch] = useState('')
  // Sprint T-ORDER.2 — sort state. Default 'number' DESC = najnowsze ZIO-2026-NNNN pierwsze.
  const [sortBy, setSortBy] = useState<SortBy>('number')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  // Sprint T-ORDER.2 — inline delete state (hover icon na row).
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)

  function handleSort(col: SortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  // Sprint T-ORDER.2 — inline row delete z double confirm (mirror order-detail
  // pattern). 1. confirm "Usunąć TRWALE?". 2. prompt z order_number. Match → DELETE.
  async function handleInlineDelete(orderId: string, orderNumber: string) {
    if (
      !confirm(
        `Usunąć TRWALE zamówienie ${orderNumber}?\n\nTej operacji nie można cofnąć.\nDokument w Fakturownia/KSeF pozostaje — usuwane jest tylko zamówienie w Sztabie.`,
      )
    )
      return
    const typed = prompt(
      `Wpisz numer zamówienia aby potwierdzić: ${orderNumber}`,
      '',
    )
    if (typed === null) return
    if (typed.trim() !== orderNumber) {
      alert('Wpisany numer nie zgadza się — usuwanie anulowane.')
      return
    }
    setDeleteBusyId(orderId)
    const res = await fetch(`/api/orders/admin/${orderId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setDeleteBusyId(null)
    if (res.ok) {
      router.refresh()
    } else {
      alert(data.error || 'Błąd usuwania zamówienia')
    }
  }

  const filtered = useMemo(() => {
    const out = orders.filter((o) => {
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

    // Sprint T-ORDER.2 — sort filtered list. Stabilność: order_number jest
    // UNIQUE więc tiebreaker по nim wystarczy. Nr jako fallback dla wszystkich
    // pozostałych comparatorów (jeśli value/client/status sa equal — newer ZIO
    // wyżej dla 'desc'/'asc' tiebreaker zgodnie z sortDir).
    const dir = sortDir === 'asc' ? 1 : -1
    out.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'number') {
        cmp = a.order_number.localeCompare(b.order_number, 'pl')
      } else if (sortBy === 'value') {
        cmp = Number(a.total_brutto || 0) - Number(b.total_brutto || 0)
      } else if (sortBy === 'client') {
        cmp = a.client.title.localeCompare(b.client.title, 'pl')
      } else if (sortBy === 'status') {
        cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      }
      if (cmp === 0 && sortBy !== 'number') {
        // tiebreaker — newer ZIO wyżej (DESC stable secondary)
        cmp = a.order_number.localeCompare(b.order_number, 'pl') * -1
      }
      return cmp * dir
    })

    return out
  }, [orders, statusFilter, search, sortBy, sortDir])

  // Aggregate metrics
  const submittedCount = orders.filter((o) => o.status === 'submitted').length
  const totalBrutto = orders
    .filter((o) => ACTIVE_STATUSES.includes(o.status))
    .reduce((s, o) => s + Number(o.total_brutto || 0), 0)

  // Sprint T-ORDER.2 — 'cancelled' dodane jako 7-ма pill po 'invoiced'.
  // Domyślnie 'all' pokazuje wszystko (włącznie z cancelled). User może
  // kliknąć "Anulowane (N)" żeby zobaczyć tylko cancelled albo dowolny inny
  // status żeby je odfiltrować.
  const statusPills: ('all' | OrderStatus)[] = [
    'all',
    'submitted',
    'confirmed',
    'in_realization',
    'shipped',
    'invoiced',
    'cancelled',
  ]

  // Sprint T-ORDER.2 — sortable header helper. Klik → handleSort. Strzałka
  // ▲/▼ tylko przy aktywnej kolumnie. Wszystkie sortable nagłówki maja
  // cursor-pointer + hover bg.
  function SortableTh({
    col,
    label,
    align,
  }: {
    col: SortBy
    label: string
    align?: 'right'
  }) {
    const active = sortBy === col
    const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
    return (
      <th
        onClick={() => handleSort(col)}
        className={`px-4 py-3 cursor-pointer select-none hover:bg-slate-100 transition ${
          align === 'right' ? 'text-right' : ''
        }`}
        title={`Sortuj wg ${label.toLowerCase()}`}
      >
        <span className={active ? 'text-slate-900' : ''}>
          {label}
          {arrow}
        </span>
      </th>
    )
  }

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
                <SortableTh col="number" label="Nr / Data" />
                <SortableTh col="client" label="Klient" />
                <th className="px-4 py-3">Kontakt</th>
                <SortableTh col="value" label="Wartość" align="right" />
                <th className="px-4 py-3">Tier</th>
                <SortableTh col="status" label="Status" />
                <th className="px-4 py-3">Dostawa</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  className="group hover:bg-amber-50/40 transition"
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
                    {/* Sprint S-CENNIK-WH.2 — mini mode badge if non-default */}
                    {o.price_mode === 'minimum' && (
                      <span className="ml-1 inline-flex items-center rounded bg-violet-100 px-1 py-0.5 text-[9px] font-medium text-violet-700 uppercase">
                        Min
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
                  {/* Sprint T-ORDER.2 — inline delete (hover icon, double-confirm). */}
                  <td className="px-2 py-3 align-top text-right">
                    <button
                      type="button"
                      onClick={() => handleInlineDelete(o.id, o.order_number)}
                      disabled={deleteBusyId === o.id}
                      title="Usuń trwale zamówienie"
                      className="opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-rose-600 disabled:opacity-50"
                    >
                      {deleteBusyId === o.id ? (
                        <span className="text-xs">...</span>
                      ) : (
                        <span className="text-base">🗑</span>
                      )}
                    </button>
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
