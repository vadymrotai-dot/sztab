/**
 * Email channel — Resend implementation.
 *
 * Resend SDK: https://resend.com/docs/api-reference/emails/send-email
 * Verified против Resend v6.12.3 SDK типів — replyTo + bcc + attachments OK.
 *
 * Env: RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO.
 * EMAIL_FROM format: "Display Name <address@domain.com>"
 *
 * Sprint S-ORDER.2.A.2 (19.05.2026).
 */

import 'server-only'

import { Resend } from 'resend'
import type { NotificationRequest, NotificationResult } from '../types'
import { renderProformaEmail } from '../templates/proforma-email'
import { renderOfferEmail } from '../templates/offer-email'
import { renderVatEmail } from '../templates/vat-email'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@sztabapp.com'
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

export async function sendEmail(
  req: NotificationRequest,
): Promise<NotificationResult> {
  if (!resend) {
    return { ok: false, error: 'Resend not configured (RESEND_API_KEY missing)' }
  }

  if (!req.recipient.email) {
    return { ok: false, error: 'Recipient email missing' }
  }

  // Render template
  const { subject, html, text } = renderTemplate(req)

  // Build attachments для Resend format
  const attachments = req.attachments?.map((a) => ({
    filename: a.filename,
    content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
  }))

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: req.recipient.email,
      replyTo: EMAIL_REPLY_TO,
      bcc: EMAIL_REPLY_TO, // copy to Vadym для tracking
      subject,
      html,
      text,
      attachments,
    })

    if (result.error) {
      console.error('[email] Resend error:', result.error)
      return {
        ok: false,
        error: result.error.message || 'Resend send failed',
      }
    }

    return {
      ok: true,
      provider_id: result.data?.id,
    }
  } catch (e: any) {
    console.error('[email] send exception:', e?.message)
    return { ok: false, error: e?.message || 'Email send failed' }
  }
}

function renderTemplate(
  req: NotificationRequest,
): { subject: string; html: string; text: string } {
  switch (req.template) {
    case 'order_proforma':
      return renderProformaEmail(req.data as any)
    case 'offer_cennik':
      return renderOfferEmail(req.data as any)
    case 'order_vat_invoice':
      return renderVatEmail(req.data as any)
    // other templates TBD
    default:
      return {
        subject: `Notification: ${req.template}`,
        html: `<p>Template not implemented: ${req.template}</p>`,
        text: `Template not implemented: ${req.template}`,
      }
  }
}
