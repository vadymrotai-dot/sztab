// app/portal/historia/page.tsx — Portal klienta Faza 1: historia zamówień (read).
// Query przez resolved client_id z sesji (izolacja). "Zamów ponownie" → reuse
// OrderForm przez /portal/zamowienie?reorder=<id> (ceny live, nie zamrożone).

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPortalUser, getPortalAccount } from '@/lib/portal/session'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  submitted: { label: 'Złożone', cls: 'bg-blue-100 text-blue-800' },
  confirmed: { label: 'Potwierdzone', cls: 'bg-indigo-100 text-indigo-800' },
  invoiced: { label: 'Zafakturowane', cls: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Anulowane', cls: 'bg-slate-100 text-slate-500' },
}

function pln(n: number | null | undefined): string {
  return `${Number(n ?? 0).toFixed(2)} zł`
}

export default async function HistoriaPage() {
  const user = await getPortalUser()
  if (!user) redirect('/portal/login')
  const acc = await getPortalAccount(user.id)
  if (!acc || acc.status !== 'approved' || !acc.client_id) redirect('/portal/onboard')

  const admin = createAdminClient()
  const { data: ordersData } = await admin
    .from('orders')
    .select('id, order_number, status, total_brutto, submitted_at, created_at')
    .eq('client_id', acc.client_id)
    .neq('status', 'draft')
    .order('submitted_at', { ascending: false, nullsFirst: false })

  const orders = (ordersData ?? []) as Array<{
    id: string
    order_number: string
    status: string
    total_brutto: number | null
    submitted_at: string | null
    created_at: string
  }>

  const ids = orders.map((o) => o.id)
  const itemsByOrder = new Map<
    string,
    Array<{ name: string; gram: string | null; qty: number; unit: number; total: number }>
  >()
  if (ids.length > 0) {
    const { data: items } = await admin
      .from('order_items')
      .select('order_id, product_name_snapshot, gramatura_snapshot, qty, unit_price, line_total')
      .in('order_id', ids)
    for (const it of (items ?? []) as any[]) {
      const arr = itemsByOrder.get(it.order_id) ?? []
      arr.push({
        name: it.product_name_snapshot,
        gram: it.gramatura_snapshot,
        qty: Number(it.qty),
        unit: Number(it.unit_price),
        total: Number(it.line_total),
      })
      itemsByOrder.set(it.order_id, arr)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-xl font-bold text-slate-800">Historia zamówień</h1>

      {orders.length === 0 ? (
        <p className="text-sm text-slate-500">
          Brak złożonych zamówień.{' '}
          <Link href="/portal/zamowienie" className="text-[#1F3A5F] underline">
            Złóż pierwsze zamówienie
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const st = STATUS_LABEL[o.status] ?? {
              label: o.status,
              cls: 'bg-slate-100 text-slate-600',
            }
            const items = itemsByOrder.get(o.id) ?? []
            const date = o.submitted_at ?? o.created_at
            return (
              <div key={o.id} className="rounded-lg border border-[#E5E1D8] bg-white p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium">{o.order_number}</span>
                    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                      {st.label}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(date).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{pln(o.total_brutto)}</span>
                    {o.status !== 'cancelled' && (
                      <Link
                        href={`/portal/zamowienie?reorder=${o.id}`}
                        className="rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600"
                      >
                        Zamów ponownie
                      </Link>
                    )}
                  </div>
                </div>
                {items.length > 0 && (
                  <ul className="divide-y divide-[#F0F0F0] text-sm">
                    {items.map((it, i) => (
                      <li key={i} className="flex items-center justify-between py-1">
                        <span className="text-slate-700">
                          {it.name}
                          {it.gram ? <span className="text-slate-400"> · {it.gram}</span> : null}
                        </span>
                        <span className="text-slate-500">
                          {it.qty} × {pln(it.unit)} = <b>{pln(it.total)}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
