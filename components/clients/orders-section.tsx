'use client'

// components/clients/orders-section.tsx
// Sprint TYDZIEN2.T2.2 (28.05.2026) — list zamówień na profilu klienta.
// Server fetches orders + items; ten client component renderuje karty
// + toggle "Pokaż szkice i anulowane" (drafts/cancelled hidden by default).

import { useState } from 'react'
import Link from 'next/link'

export interface OrderRow {
  id: string
  order_number: string
  status: string
  cennik_tier: string | null
  price_mode: string | null
  total_net: number
  total_brutto: number
  total_vat: number
  delivery_address: string | null
  preferred_delivery_date: string | null
  customer_notes: string | null
  submitted_at: string | null
  created_at: string
  link_opened_at: string | null
  confirmed_at: string | null
  proforma_fakturownia_number: string | null
  vat_fakturownia_number: string | null
}

export interface OrderItemPreview {
  product_name_snapshot: string
  qty: number
  gramatura_snapshot: string | null
}

interface Props {
  orders: OrderRow[]
  itemsByOrder: Record<string, OrderItemPreview[]>
}

const REAL_STATUSES = new Set([
  'submitted',
  'confirmed',
  'in_realization',
  'shipped',
  'invoiced',
])
// 'draft' i 'cancelled' hidden by default (clutter: link-clicked drafts +
// odwołane zamówienia). Toggle ukazuje całą historię.

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Szkic', cls: 'bg-[#F5F5F5] text-[#666] border-[#E5E5E5]' },
  submitted: { label: 'Wysłane', cls: 'bg-[#DBEAFE] text-[#1E40AF] border-[#BFDBFE]' },
  confirmed: { label: 'Potwierdzone', cls: 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]' },
  in_realization: { label: 'W realizacji', cls: 'bg-[#E0E7FF] text-[#3730A3] border-[#C7D2FE]' },
  shipped: { label: 'Wysłano', cls: 'bg-[#CCFBF1] text-[#0F766E] border-[#99F6E4]' },
  invoiced: { label: 'Faktura VAT', cls: 'bg-[#F3E8FF] text-[#6B21A8] border-[#E9D5FF]' },
  cancelled: { label: 'Anulowane', cls: 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: 'bg-[#F5F5F5] text-[#555] border-[#E5E5E5]' }
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    // Sprint TYDZIEN2 BUGFIX (28.05.2026) — fixed timeZone defensively aby
    // uniknąć React #418 hydration mismatch na /clients/[id] page (gdy Vadym
    // tam pojdzie). SSR Node UTC vs browser Europe/Warsaw → text mismatch.
    return new Date(iso).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Warsaw',
    })
  } catch {
    return iso
  }
}

function formatPLN(n: number): string {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł'
}

function itemsPreview(items: OrderItemPreview[]): string {
  if (items.length === 0) return 'brak pozycji'
  const first = items.slice(0, 2).map((i) => `${i.product_name_snapshot} ×${i.qty}`).join(', ')
  const rest = items.length - 2
  return rest > 0 ? `${first}, +${rest} pozycji` : first
}

export function OrdersSection({ orders, itemsByOrder }: Props) {
  const [showAll, setShowAll] = useState(false)

  const realOrders = orders.filter((o) => REAL_STATUSES.has(o.status))
  const hiddenOrders = orders.filter((o) => !REAL_STATUSES.has(o.status))
  const visible = showAll ? orders : realOrders

  if (orders.length === 0) {
    return (
      <div className="rounded border border-dashed border-[#E5E1D8] bg-[#FAFAF7] p-6 text-center text-sm text-[#888]">
        Brak zamówień dla tego klienta.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Toggle row */}
      {hiddenOrders.length > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#888]">
            {realOrders.length} zamówień widoczne
            {!showAll && hiddenOrders.length > 0 && ` · ${hiddenOrders.length} ukryte (szkice/anulowane)`}
          </span>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded border border-[#E5E1D8] bg-white px-2 py-1 text-[11px] font-medium text-[#555] hover:bg-[#F5F5F5]"
          >
            {showAll ? `Ukryj szkice i anulowane` : `Pokaż szkice i anulowane (${hiddenOrders.length})`}
          </button>
        </div>
      )}

      {visible.length === 0 && (
        <div className="rounded border border-dashed border-[#E5E1D8] bg-[#FAFAF7] p-6 text-center text-sm text-[#888]">
          Brak realnych zamówień. {hiddenOrders.length > 0 && 'Toggle wyżej аby zobaczyć szkice.'}
        </div>
      )}

      {visible.map((o) => {
        const items = itemsByOrder[o.id] ?? []
        // Use submitted_at jeśli istnieje, fallback created_at — date sortowane na server, tu тільки label.
        const dateLabel = o.submitted_at ? formatDate(o.submitted_at) : formatDate(o.created_at)
        const dateHint = o.submitted_at ? 'wysłano' : 'utworzono'
        return (
          <Link
            key={o.id}
            href={`/operacje/zamowienia/${o.id}`}
            className="block rounded border border-[#E5E1D8] bg-white p-3 transition-colors hover:border-[#D4D0C5] hover:bg-[#FAFAF7]"
          >
            <div className="flex items-start justify-between gap-3">
              {/* Left: identifiers */}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold text-[#222]">
                    {o.order_number}
                  </span>
                  <StatusBadge status={o.status} />
                  {o.cennik_tier && o.cennik_tier !== 'standard' && (
                    <span className="rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-medium text-[#92400E]">
                      {o.cennik_tier === 'wielki_hurt' ? 'Wielki hurt' : o.cennik_tier}
                    </span>
                  )}
                  {o.vat_fakturownia_number && (
                    <span className="rounded bg-[#F3E8FF] px-1.5 py-0.5 text-[10px] font-medium text-[#6B21A8]">
                      FV {o.vat_fakturownia_number}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#888]">
                  {dateHint} {dateLabel}
                  {o.preferred_delivery_date && (
                    <span className="ml-2">· dostawa pref. {formatDate(o.preferred_delivery_date)}</span>
                  )}
                </div>
                {o.delivery_address && (
                  <div className="truncate text-[12px] text-[#555]" title={o.delivery_address}>
                    📍 {o.delivery_address}
                  </div>
                )}
                <div className="text-[12px] text-[#666]">
                  {itemsPreview(items)}
                </div>
              </div>

              {/* Right: amount + arrow */}
              <div className="shrink-0 text-right">
                <div className="text-[15px] font-semibold text-[#222]">
                  {formatPLN(o.total_brutto)}
                </div>
                <div className="text-[10px] text-[#888]">
                  brutto · {items.length} {items.length === 1 ? 'pozycja' : 'pozycji'}
                </div>
                <div className="mt-1 text-[11px] text-[#4F46E5]">Otwórz →</div>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
