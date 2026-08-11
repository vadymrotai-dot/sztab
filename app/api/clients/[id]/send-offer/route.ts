// app/api/clients/[id]/send-offer/route.ts
// Sprint S-OFFER.1 (21.05.2026) — sales outreach з cennik xlsx + auto order link.
//
// POST /api/clients/[id]/send-offer
//   Body: { email, message, create_order_link?, cohort_id?: uuid|null }
//   - Auth required (cookies session)
//   - Verify client existуй
//   - Якщо create_order_link → INSERT new draft order (з cohort_id), generate link
//   - Replace <<order_link>> placeholder у message з real URL
//   - Read public/cennik/Ziomek_Fish_Cennik_B2B_2026.xlsx
//   - sendNotification('email', 'offer_cennik') з xlsx attached
//
// Service-role bypass для admin operations (INSERT order, read clients).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNotification } from '@/lib/notifications/sender'
import fs from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sztab.vercel.app'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth gate
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Nieautoryzowany' },
      { status: 401 },
    )
  }

  const { id: clientId } = await params
  const body = await req.json().catch(() => ({}))
  const email = body.email?.trim()
  const message = body.message?.trim()
  const createOrderLink = body.create_order_link !== false
  const cohortId = body.cohort_id || null
  // Krok DAGOLD — stara matryca (cennik_tier/price_mode) wycofana; zamówienia
  // liczą się przez cena A + rabaty wolumenowe. Stałe defaulty utrzymują spójność
  // kolumn order (legacy produkty bez marży → standard/auto).
  const cennikTier = 'standard' as const
  const priceMode = 'auto' as const
  // Język oferty (PL/UA) wybrany przez operatora przy wysyłce.
  const offerLang: 'pl' | 'ua' = body.offer_lang === 'ua' ? 'ua' : 'pl'

  if (!email || !email.includes('@')) {
    return NextResponse.json(
      { ok: false, error: 'Nieprawidłowy adres email' },
      { status: 400 },
    )
  }
  if (!message) {
    return NextResponse.json(
      { ok: false, error: 'Treść wiadomości wymagana' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // Verify client existуй
  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, title, email')
    .eq('id', clientId)
    .maybeSingle()

  if (clientError || !client) {
    return NextResponse.json(
      { ok: false, error: 'Klient nie znaleziony' },
      { status: 404 },
    )
  }

  let orderLink = ''
  let orderId: string | null = null
  let finalMessage = message

  if (createOrderLink) {
    // Idempotent: reuse existing draft if present, інакше створи новий
    const { data: existingDraft } = await admin
      .from('orders')
      .select('id, access_token')
      .eq('client_id', clientId)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let accessToken: string
    if (existingDraft) {
      // Sprint S-CENNIK-WH.2.1 (27.05.2026) — refresh tier+mode+cohort if Vadym
      // changed wybór between sends (idempotency reuses access_token but tier/mode
      // must reflect newest send-offer parameters).
      const refreshResult = await admin
        .from('orders')
        .update({
          cennik_tier: cennikTier,
          price_mode: priceMode,
          cohort_id: cohortId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDraft.id)
      if (refreshResult.error) {
        console.error(
          '[send-offer] failed to refresh existing draft',
          refreshResult.error.message,
        )
        // soft-fail: continue з old values rather than block send
      }
      orderId = existingDraft.id
      accessToken = existingDraft.access_token
    } else {
      const { data: newOrder, error: orderError } = await admin
        .from('orders')
        .insert({
          client_id: clientId,
          cohort_id: cohortId,
          order_number: `DRAFT-${Date.now()}-${clientId.slice(0, 8)}`,
          status: 'draft',
          cennik_tier: cennikTier,
          // Sprint S-CENNIK-WH.2 — price_mode locked at offer-send
          price_mode: priceMode,
        })
        .select('id, access_token')
        .single()

      if (orderError || !newOrder) {
        console.error(
          '[send-offer] failed to create order link',
          orderError?.message,
        )
        return NextResponse.json(
          { ok: false, error: 'Nie udało się wygenerować linku' },
          { status: 500 },
        )
      }

      orderId = newOrder.id
      accessToken = newOrder.access_token
    }

    orderLink = `${SITE_URL}/zamowienie/${accessToken}`

    // Replace placeholder у message з real link
    finalMessage = message.replace(/<<order_link>>/g, orderLink)
  }

  // Krok DAGOLD — załącznik = oferta DAGOLD (ЧМ + ryby + kalmary z tabelą rabatów)
  // w wybranym języku.
  const xlsxFilename =
    offerLang === 'ua' ? 'DAGOLD_oferta_UA.xlsx' : 'DAGOLD_oferta_PL.xlsx'
  let xlsxBytes: Buffer
  try {
    const xlsxPath = path.join(process.cwd(), 'public', 'cennik', xlsxFilename)
    xlsxBytes = await fs.readFile(xlsxPath)
  } catch (e: any) {
    console.error('[send-offer] failed to read xlsx', { tier: cennikTier, error: e?.message })
    return NextResponse.json(
      { ok: false, error: 'Cennik file not found' },
      { status: 500 },
    )
  }

  // Send notification
  const result = await sendNotification({
    channel: 'email',
    recipient: { email },
    template: 'offer_cennik',
    client_id: client.id,
    order_id: orderId || undefined,
    data: {
      custom_message: finalMessage,
      order_link: orderLink,
      client_name: client.title,
      attachment_filename: xlsxFilename,
      // Krok DAGOLD — język oferty (temat + etykiety maila).
      lang: offerLang,
    },
    attachments: [
      {
        filename: xlsxFilename,
        content: xlsxBytes,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
  })

  return NextResponse.json({
    ok: result.ok,
    log_id: result.log_id,
    order_link: orderLink || undefined,
    error: result.error,
  })
}
