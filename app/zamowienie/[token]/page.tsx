// app/zamowienie/[token]/page.tsx
// Sprint S-ORDER.1.B.2 (19.05.2026) — public order form server component.
// Fetches initial data from /api/orders/[token] then hands off to client wizard.

import { headers } from 'next/headers'
import { OrderForm, type OrderInitial } from '@/components/zamowienie/order-form'
import { ErrorScreen } from '@/components/zamowienie/error-screen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ApiResponse =
  | ({ ok: true } & OrderInitial)
  | { ok: false; error: string; order_number?: string; status?: string }

async function fetchOrderData(
  token: string,
): Promise<{ status: number; data: ApiResponse }> {
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const base = `${proto}://${host}`

  const res = await fetch(`${base}/api/orders/${token}`, {
    cache: 'no-store',
    headers: { 'x-internal-call': '1' },
  })
  const data = (await res.json()) as ApiResponse
  return { status: res.status, data }
}

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const { status, data } = await fetchOrderData(token)

  if (status === 404) {
    return <ErrorScreen variant="not-found" />
  }
  if (status === 409 && !data.ok) {
    return (
      <ErrorScreen
        variant="already-submitted"
        orderNumber={data.order_number}
      />
    )
  }
  if (!data.ok) {
    return <ErrorScreen variant="error" message={data.error} />
  }

  return <OrderForm token={token} initial={data} />
}
