// components/operacje/order-detail.tsx
// Sprint S-ORDER.1.C.2 (19.05.2026) — admin order detail з status change + internal notes.
// Sprint S-ORDER.1.C.3 (19.05.2026) — inline edit pozycji: qty change, delete, add new SKU.

'use client'

import { useState, useTransition, useMemo } from 'react'
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

// Sprint S-CENNIK-WH.1 (26.05.2026) — wielki_hurt 4-й tier (locked).
// Sprint S-CENNIK-WH.2 (26.05.2026) — wielki_hurt_entry 5-й tier (Hurt < 10k).
type Tier = 'maly' | 'sredni' | 'duzy' | 'wielki_hurt' | 'wielki_hurt_entry'
type PriceMode = 'auto' | 'minimum'

type Item = {
  id: string
  product_name_snapshot: string
  gramatura_snapshot: string | null
  qty: number
  unit_price: number
  line_total: number
}

type AvailableProduct = {
  id: string
  name: string
  display_name: string | null
  gramatura: string | null
  order_form_sort: number | null
  price_maly_opt: number
  price_sredni: number
  price_duzy: number
  price_duzi_gracze: number
}

const EDITABLE_STATUSES: OrderStatus[] = [
  'submitted',
  'confirmed',
  'in_realization',
]

type Order = {
  id: string
  order_number: string
  status: OrderStatus
  tier_at_submit: Tier | null
  // Sprint S-CENNIK-WH.1/WH.2 — locked at offer-send (matrix 2x2)
  cennik_tier?: 'standard' | 'wielki_hurt' | null
  price_mode?: PriceMode | null
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
  // S-ORDER.2.A — Fakturownia tracking
  proforma_fakturownia_id: number | null
  proforma_fakturownia_number: string | null
  proforma_pdf_url: string | null
  proforma_created_at: string | null
  vat_fakturownia_id: number | null
  vat_fakturownia_number: string | null
  vat_pdf_url: string | null
  vat_created_at: string | null
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
  wielki_hurt: 'Wielki Hurt',
  wielki_hurt_entry: 'Hurt',
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
    d.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }) +
    ' ' +
    d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })
  )
}

function fmtDateOnly(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })
}

export function OrderDetail({
  order,
  availableProducts,
}: {
  order: Order
  availableProducts: AvailableProduct[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [notes, setNotes] = useState(order.internal_notes || '')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [itemBusy, setItemBusy] = useState<string | null>(null)
  // S-ORDER.2.A.4 — VAT invoice issue state
  const [vatLoading, setVatLoading] = useState(false)
  const [vatNotice, setVatNotice] = useState<string | null>(null)
  const [vatError, setVatError] = useState<string | null>(null)
  // Sprint T-ORDER.1 (30.05.2026) — manual proforma send state
  const [proformaLoading, setProformaLoading] = useState(false)
  const [proformaNotice, setProformaNotice] = useState<string | null>(null)
  const [proformaError, setProformaError] = useState<string | null>(null)

  const canEdit = EDITABLE_STATUSES.includes(order.status)
  const tier = order.tier_at_submit || 'maly'

  const updateQty = async (itemId: string, newQty: number) => {
    if (newQty < 1) return
    setItemBusy(itemId)
    const res = await fetch(`/api/orders/admin/${order.id}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, qty: newQty }),
    })
    setItemBusy(null)
    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Błąd zmiany ilości')
    }
  }

  const deleteItem = async (itemId: string) => {
    if (!confirm('Usunąć pozycję z zamówienia?')) return
    setItemBusy(itemId)
    const res = await fetch(`/api/orders/admin/${order.id}/items`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId }),
    })
    setItemBusy(null)
    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Błąd usuwania')
    }
  }

  const addItem = async (productId: string, qty: number) => {
    const res = await fetch(`/api/orders/admin/${order.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, qty }),
    })
    if (res.ok) {
      setShowAddModal(false)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Błąd dodawania pozycji')
    }
  }

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

  // Sprint T-ORDER.1 (30.05.2026) — manual proforma send handler.
  // Mirror pattern z issueVatInvoice — confirm + POST + toast + delayed refresh.
  const sendProforma = async () => {
    if (
      !confirm(
        `Wysłać fakturę proforma dla ${order.order_number}?\n\nProforma zostanie wystawiona w Fakturowni i wysłana na adres ${order.contact_email}.`,
      )
    )
      return
    setProformaLoading(true)
    setProformaError(null)
    setProformaNotice(null)
    const res = await fetch(
      `/api/orders/admin/${order.id}/send-proforma`,
      { method: 'POST' },
    )
    const data = await res.json().catch(() => ({}))
    setProformaLoading(false)
    if (res.ok) {
      setProformaNotice(
        'Wysyłanie faktury proforma uruchomione w tle (~30s). Status zaktualizuje się automatycznie po odświeżeniu.',
      )
      // Background task ~10-30s. Polling cheap — refresh раз через 8s.
      setTimeout(() => router.refresh(), 8000)
    } else {
      setProformaError(data.error || 'Błąd wysyłania faktury proforma')
    }
  }

  const issueVatInvoice = async () => {
    if (
      !confirm(
        `Wystawić fakturę VAT dla ${order.order_number}?\n\nFaktura zostanie automatycznie wysłana do KSeF oraz na adres ${order.contact_email}.`,
      )
    )
      return
    setVatLoading(true)
    setVatError(null)
    setVatNotice(null)
    const res = await fetch(
      `/api/orders/admin/${order.id}/issue-vat-invoice`,
      { method: 'POST' },
    )
    const data = await res.json().catch(() => ({}))
    setVatLoading(false)
    if (res.ok) {
      setVatNotice(
        'Wystawianie faktury VAT uruchomione w tle (~30s). Status zaktualizuje się automatycznie po odświeżeniu.',
      )
      // Background task ~10-30s. Polling cheap — refresh раз через 8s.
      setTimeout(() => router.refresh(), 8000)
    } else {
      setVatError(data.error || 'Błąd wystawiania faktury VAT')
    }
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
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">Pozycje zamówienia</h2>
              {canEdit && (
                <div className="flex items-center gap-2">
                  {editMode && (
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="text-xs px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 font-semibold"
                    >
                      + Dodaj pozycję
                    </button>
                  )}
                  <button
                    onClick={() => setEditMode(!editMode)}
                    className={`text-xs px-3 py-1 rounded font-semibold transition ${
                      editMode
                        ? 'bg-slate-200 text-slate-900 hover:bg-slate-300'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {editMode ? 'Zakończ edycję' : 'Edytuj pozycje'}
                  </button>
                </div>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">Produkt</th>
                  <th className="px-4 py-2 text-right">Ilość</th>
                  <th className="px-4 py-2 text-right">Cena</th>
                  <th className="px-4 py-2 text-right">Suma</th>
                  {editMode && <th className="px-2 py-2 w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((item) => {
                  const busy = itemBusy === item.id
                  return (
                    <tr key={item.id} className={busy ? 'opacity-50' : ''}>
                      <td className="px-4 py-3">
                        <div className="text-slate-900">
                          {item.product_name_snapshot}
                        </div>
                        {item.gramatura_snapshot && (
                          <div className="text-xs text-slate-500">
                            {item.gramatura_snapshot}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900">
                        {editMode ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => updateQty(item.id, item.qty - 1)}
                              disabled={item.qty <= 1 || busy}
                              className="w-7 h-7 border border-slate-300 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                            >
                              −
                            </button>
                            <span className="w-12 text-center font-mono text-sm font-semibold">
                              {item.qty}
                            </span>
                            <button
                              onClick={() => updateQty(item.id, item.qty + 1)}
                              disabled={busy}
                              className="w-7 h-7 border border-slate-300 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <>{item.qty} szt</>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {fmt(Number(item.unit_price))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {fmt(Number(item.line_total))}
                      </td>
                      {editMode && (
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={() => deleteItem(item.id)}
                            disabled={busy || order.items.length <= 1}
                            title={
                              order.items.length <= 1
                                ? 'Nie można usunąć ostatniej pozycji'
                                : 'Usuń pozycję'
                            }
                            className="w-7 h-7 text-rose-600 hover:bg-rose-50 rounded disabled:opacity-30"
                          >
                            ×
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                <tr>
                  <td
                    colSpan={editMode ? 4 : 3}
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
                    colSpan={editMode ? 4 : 3}
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
                    colSpan={editMode ? 4 : 3}
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

          {/* S-ORDER.2.A.4 — Faktura VAT block */}
          {order.vat_fakturownia_id ? (
            // VAT already issued — show summary з link
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="text-xs font-semibold text-emerald-900 uppercase tracking-wider mb-2">
                Faktura VAT
              </div>
              <div className="font-mono text-sm font-semibold text-slate-900 mb-1">
                {order.vat_fakturownia_number}
              </div>
              <div className="text-xs text-emerald-800 mb-2">
                Wysłana do KSeF · {fmtDate(order.vat_created_at)}
              </div>
              {order.vat_pdf_url && (
                <a
                  href={order.vat_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs px-3 py-1.5 bg-emerald-700 text-white rounded hover:bg-emerald-800 font-semibold"
                >
                  Zobacz fakturę PDF →
                </a>
              )}
            </div>
          ) : (
            order.status === 'shipped' &&
            order.proforma_fakturownia_id && (
              // Eligible to issue VAT — show button
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
                  Faktura VAT
                </div>
                <button
                  onClick={issueVatInvoice}
                  disabled={vatLoading}
                  className="w-full px-3 py-2 rounded-lg text-sm font-semibold transition bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {vatLoading
                    ? 'Wystawianie...'
                    : '📄 Wystaw fakturę VAT'}
                </button>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Automatyczna wysyłka do KSeF + email do klienta z PDF
                  w załączniku.
                </p>
                {vatNotice && (
                  <div className="mt-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                    {vatNotice}
                  </div>
                )}
                {vatError && (
                  <div className="mt-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
                    {vatError}
                  </div>
                )}
              </div>
            )
          )}

          {/* Sprint T-ORDER.1 (30.05.2026) — Proforma block.
              Gdy proforma_fakturownia_id NULL i order nie cancelled → button
              "Potwierdź i wyślij proformę". Gdy istnieje → summary z numerem +
              PDF link (read-only). */}
          {order.proforma_fakturownia_id ? (
            // Proforma już wysłana — summary
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                ✓ Faktura proforma wysłana
              </div>
              <div className="font-mono text-sm font-semibold text-slate-900 mb-1">
                {order.proforma_fakturownia_number}
              </div>
              <div className="text-xs text-slate-500 mb-2">
                {fmtDate(order.proforma_created_at)}
              </div>
              {order.proforma_pdf_url && (
                <a
                  href={order.proforma_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs px-3 py-1.5 bg-slate-200 text-slate-900 rounded hover:bg-slate-300 font-semibold"
                >
                  Zobacz PDF →
                </a>
              )}
            </div>
          ) : (
            order.status !== 'cancelled' &&
            order.contact_email && (
              // Eligible — show button "Potwierdź i wyślij proformę"
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
                  Faktura proforma
                </div>
                <button
                  onClick={sendProforma}
                  disabled={proformaLoading}
                  className="w-full px-3 py-2 rounded-lg text-sm font-semibold transition bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {proformaLoading
                    ? 'Wysyłanie...'
                    : '📧 Potwierdź i wyślij proformę'}
                </button>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Wystawia proformę w Fakturowni i wysyła email z PDF do{' '}
                  <strong className="break-all">{order.contact_email}</strong>.
                </p>
                {proformaNotice && (
                  <div className="mt-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                    {proformaNotice}
                  </div>
                )}
                {proformaError && (
                  <div className="mt-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
                    {proformaError}
                  </div>
                )}
              </div>
            )
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
            {/* Sprint S-CENNIK-WH.2 — cennik + mode badge */}
            {(order.cennik_tier || order.price_mode) && (
              <div>
                Cennik · tryb:{' '}
                <span className="text-slate-900 font-medium">
                  {order.cennik_tier === 'wielki_hurt' ? 'Wielki Hurt' : 'Standardowy'}
                  {order.price_mode ? ` · ${order.price_mode === 'minimum' ? 'Minimum' : 'Auto'}` : ''}
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

      {showAddModal && (
        <AddItemModal
          availableProducts={availableProducts}
          tier={tier}
          onClose={() => setShowAddModal(false)}
          onAdd={addItem}
        />
      )}
    </div>
  )
}

// ── AddItemModal ──────────────────────────────────────────────────────────
// 17 SKU list з search + qty input + click "Dodaj".

function AddItemModal({
  availableProducts,
  tier,
  onClose,
  onAdd,
}: {
  availableProducts: AvailableProduct[]
  tier: Tier
  onClose: () => void
  onAdd: (productId: string, qty: number) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  // Sprint S-CENNIK-WH.1 — branch by tier для priceKey display
  const priceKey:
    | 'price_maly_opt'
    | 'price_sredni'
    | 'price_duzy'
    | 'price_duzi_gracze' =
    tier === 'wielki_hurt'
      ? 'price_duzi_gracze'
      : tier === 'maly'
        ? 'price_maly_opt'
        : tier === 'sredni'
          ? 'price_sredni'
          : 'price_duzy'

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return availableProducts
    return availableProducts.filter((p) => {
      const name = (p.display_name || p.name).toLowerCase()
      return name.includes(q) || (p.gramatura || '').toLowerCase().includes(q)
    })
  }, [availableProducts, search])

  const submit = async () => {
    if (!selectedId || qty < 1) return
    setSubmitting(true)
    await onAdd(selectedId, qty)
    setSubmitting(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Dodaj pozycję</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            ×
          </button>
        </div>

        <div className="p-4 border-b border-slate-200">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj produktu..."
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-slate-900"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Brak produktów pasujących do "{search}"
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((p) => {
                const isSelected = selectedId === p.id
                const price = Number((p as any)[priceKey])
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${
                      isSelected ? 'bg-amber-50' : ''
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex-1">
                        <div className="text-sm text-slate-900 font-medium">
                          {p.display_name || p.name}
                        </div>
                        {p.gramatura && (
                          <div className="text-xs text-slate-500">{p.gramatura}</div>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                        {price.toLocaleString('pl-PL', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        zł
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex items-center gap-2">
          <label className="text-xs text-slate-600">Ilość:</label>
          <input
            type="number"
            min={1}
            max={9999}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-center"
          />
          <button
            onClick={submit}
            disabled={!selectedId || submitting}
            className="ml-auto px-4 py-2 bg-slate-900 text-white rounded text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Dodawanie...' : 'Dodaj do zamówienia'}
          </button>
        </div>
      </div>
    </div>
  )
}
