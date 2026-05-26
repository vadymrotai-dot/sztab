/**
 * Offer email template — sales outreach з cennik xlsx + order link.
 *
 * Sprint S-OFFER.1 (21.05.2026).
 *
 * Vadym edits custom_message text у modal перш ніж wysłać.
 * Template converts plain text → HTML:
 *  - Splits paragraphs by double newline (\n\n)
 *  - Single newline → <br>
 *  - HTTP/HTTPS URLs → clickable amber links
 *  - HTML special chars escaped (&, <, >)
 *
 * order_link placeholder substitution done у route.ts перед render.
 */

import 'server-only'

export type OfferEmailData = {
  custom_message: string // Vadym edited text from modal (order_link уже replaced)
  order_link: string // auto-generated link (display only, у footer)
  client_name: string
  // Sprint S-CENNIK-WH.1 (26.05.2026) — attachment filename branches by tier.
  // Defaults to standard cennik if not provided (backward compat).
  attachment_filename?: string
}

export function renderOfferEmail(data: OfferEmailData): {
  subject: string
  html: string
  text: string
} {
  // Sprint S-CENNIK-WH.1 — attachment filename driven by tier (parametrized).
  const attachmentFilename =
    data.attachment_filename || 'Ziomek_Fish_Cennik_B2B_2026.xlsx'
  const subject = 'Oferta hurtowa Czudowa Marka  ·  Ziomek Fish'

  // Convert plain text → HTML (paragraph splitting + make URLs clickable)
  const messageHtml = data.custom_message
    .split(/\n\n+/)
    .map((para) => {
      const escaped = para
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(
          /(https?:\/\/[^\s]+)/g,
          '<a href="$1" style="color:#d97706;text-decoration:underline">$1</a>',
        )
      return `<p style="margin:0 0 16px 0;line-height:1.6">${escaped.replace(/\n/g, '<br>')}</p>`
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1e293b; line-height: 1.5; max-width: 600px; margin: 0 auto; padding: 24px; }
  .header { border-bottom: 3px solid #d97706; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { margin: 0; color: #1e293b; font-size: 22px; }
  .brand { color: #d97706; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .attachment-note { background: #f8fafc; border-left: 3px solid #d97706; padding: 12px 16px; margin: 16px 0; font-size: 14px; }
  .footer { color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">Ziomek Fish &middot; Czudowa Marka</div>
    <h1>Oferta hurtowa</h1>
  </div>
  ${messageHtml}
  <div class="attachment-note">
    <strong>Załącznik:</strong> ${attachmentFilename}
  </div>
  <div class="footer">
    Ziomek Fish Sp. z o.o.<br>
    ul. Szczęsna 26, 02-454 Warszawa<br>
    NIP: 5223239864 &middot; KRS: 0001000146
  </div>
</body>
</html>`

  return { subject, html, text: data.custom_message }
}
