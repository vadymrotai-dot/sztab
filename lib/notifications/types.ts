/**
 * Multi-channel notification system types.
 *
 * Channels: email (Resend), sms (TBD), whatsapp (Twilio TBD), telegram (Bot API TBD).
 * Architecture: один sender API, multiple channel implementations.
 *
 * Sprint S-ORDER.2.A.2 (19.05.2026).
 */

import 'server-only'

export type NotificationChannel = 'email' | 'sms' | 'whatsapp' | 'telegram'

export type NotificationTemplate =
  | 'order_proforma' // після submit, з PDF attached
  | 'order_confirmed' // після Vadym confirms
  | 'order_shipped' // після Vadym ships + VAT created
  | 'order_invoiced' // після payment received
  | 'order_cancelled' // якщо anulowano
  | 'payment_reminder' // якщо overdue
  | 'offer_cennik' // S-OFFER.1 — sales outreach з xlsx cennik + order link

export type NotificationStatus =
  | 'pending' // queued, не sent
  | 'sent' // успішно sent (provider accepted)
  | 'failed' // network/auth error
  | 'bounced' // recipient invalid (email bounced)
  | 'opened' // tracking pixel hit (email only)
  | 'clicked' // link click tracked

export type RecipientInfo = {
  email?: string
  phone?: string // E.164 format (+48...)
  whatsapp?: string // E.164
  telegram_id?: number // chat_id
}

export type NotificationRequest = {
  channel: NotificationChannel
  recipient: RecipientInfo
  template: NotificationTemplate

  // Context для template
  order_id?: string
  client_id?: string

  // Template data (passed до template renderer)
  data: Record<string, any>

  // Optional attachments (email only currently)
  attachments?: Array<{
    filename: string
    content: Buffer // або string base64
    contentType?: string
  }>
}

export type NotificationResult = {
  ok: boolean
  log_id?: string // notification_log.id
  provider_id?: string // Resend message ID, Twilio SID, etc
  error?: string
}
