// app/portal/zamowienie/page.tsx — Portal klienta Faza 0, ekran zamówienia.
// REUSE: resolve client_id z sesji (approved) → znajdź/utwórz draft order →
// weź access_token WEWNĘTRZNIE → ten sam GET /api/orders/[token] + <OrderForm>.
// Granicą dostępu jest sesja logowania, nie sekret w URL. Cena z pricing.ts
// (liczy GET), zero nowej logiki.

import { redirect } from 'next/navigation'
import { getPortalUser, getPortalAccount } from '@/lib/portal/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadOrderInitial } from '@/lib/orders/load-order-initial'
import { OrderForm, type OrderInitial } from '@/components/zamowienie/order-form'
import { ErrorScreen } from '@/components/zamowienie/error-screen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function PortalOrderPage() {
  const user = await getPortalUser()
  if (!user) redirect('/portal/login')

  const acc = await getPortalAccount(user.id)
  if (!acc || acc.status !== 'approved' || !acc.client_id) {
    redirect('/portal/onboard')
  }

  const admin = createAdminClient()

  // Znajdź istniejący draft klienta albo utwórz nowy (idempotentnie 1 draft).
  let token: string
  const { data: draft } = await admin
    .from('orders')
    .select('id, access_token')
    .eq('client_id', acc.client_id)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (draft?.access_token) {
    token = draft.access_token as string
  } else {
    const { data: created, error } = await admin
      .from('orders')
      .insert({
        client_id: acc.client_id,
        order_number: `PORTAL-${Date.now()}-${acc.client_id.slice(0, 8)}`,
        status: 'draft',
        cennik_tier: 'standard',
        price_mode: 'auto',
      })
      .select('access_token')
      .single()
    if (error || !created) {
      return <ErrorScreen variant="error" message="Nie udało się otworzyć zamówienia" />
    }
    token = created.access_token as string
  }

  // Ten sam loader co /api/orders/[token] — wołany BEZPOŚREDNIO (bez self-HTTP,
  // który na Preview łapie SSO). Cena liczona przez pricing.ts w loaderze.
  const { body } = await loadOrderInitial(token)
  if (!body.ok) {
    return <ErrorScreen variant="error" message={body.error} />
  }

  return <OrderForm token={token} initial={body as OrderInitial} />
}
