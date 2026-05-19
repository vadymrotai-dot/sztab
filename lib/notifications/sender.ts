/**
 * Multi-channel notification router.
 *
 * Single entry point: sendNotification({ channel, recipient, template, data, attachments }).
 * Routes до channel-specific implementation, writes до notification_log.
 *
 * Failure semantics: НЕ throw. Errors logged до notification_log + returned як { ok: false, error }.
 * Caller (submit endpoint) НЕ блокується failure (fire-and-forget pattern).
 *
 * Sprint S-ORDER.2.A.2 (19.05.2026).
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationRequest, NotificationResult } from './types'
import { sendEmail } from './channels/email'

export async function sendNotification(
  req: NotificationRequest,
): Promise<NotificationResult> {
  // 1. Insert pending log entry
  const admin = createAdminClient()
  const recipientStr = pickRecipientString(req)

  const { data: logRow, error: logErr } = await admin
    .from('notification_log')
    .insert({
      order_id: req.order_id || null,
      client_id: req.client_id || null,
      channel: req.channel,
      recipient: recipientStr,
      template: req.template,
      subject: req.data.subject || null,
      payload_summary: summarize(req),
      status: 'pending',
    })
    .select('id')
    .single()

  if (logErr || !logRow) {
    console.error('[notifications] failed to create log entry:', logErr?.message)
    return { ok: false, error: 'Audit log creation failed' }
  }

  const logId = logRow.id as string

  // 2. Route до channel implementation
  let result: NotificationResult
  try {
    switch (req.channel) {
      case 'email':
        result = await sendEmail(req)
        break
      case 'sms':
      case 'whatsapp':
      case 'telegram':
        result = { ok: false, error: `Channel ${req.channel} not implemented yet` }
        break
      default:
        result = { ok: false, error: `Unknown channel: ${req.channel}` }
    }
  } catch (e: any) {
    console.error('[notifications] channel error', e?.message)
    result = { ok: false, error: e?.message || 'Unknown error' }
  }

  // 3. Update log з результатом
  const updates: Record<string, any> = {
    status: result.ok ? 'sent' : 'failed',
    sent_at: result.ok ? new Date().toISOString() : null,
  }
  if (result.provider_id) updates.provider_id = result.provider_id
  if (result.error) updates.error_message = result.error

  await admin.from('notification_log').update(updates).eq('id', logId)

  result.log_id = logId
  return result
}

function pickRecipientString(req: NotificationRequest): string {
  if (req.channel === 'email') return req.recipient.email || '<missing>'
  if (req.channel === 'sms') return req.recipient.phone || '<missing>'
  if (req.channel === 'whatsapp')
    return req.recipient.whatsapp || req.recipient.phone || '<missing>'
  if (req.channel === 'telegram')
    return String(req.recipient.telegram_id || '<missing>')
  return '<unknown>'
}

function summarize(req: NotificationRequest): string {
  const parts = [`template=${req.template}`]
  if (req.data.order_number) parts.push(`order=${req.data.order_number}`)
  if (req.data.total) parts.push(`total=${req.data.total}`)
  if (req.attachments?.length) parts.push(`attachments=${req.attachments.length}`)
  return parts.join(' ')
}
