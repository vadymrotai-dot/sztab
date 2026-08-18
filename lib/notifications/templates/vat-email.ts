/**
 * Email template для VAT faktura після status='shipped'.
 *
 * Sent FROM: DAGOLD <zamowienia@sztabapp.com>
 * BCC: vasin@dagold.com (Vadym дістає копію)
 *
 * Content:
 * - Header з brand (DAGOLD)
 * - Greeting + info що VAT wystawiona po wysyłce
 * - Order number + VAT number
 * - Total breakdown (net / VAT / brutto)
 * - KSeF info (faktura wysłana do KSeF automatycznie per ustawa Feb 2026)
 * - PDF attached
 * - Contact info
 *
 * Sprint S-ORDER.2.A.4 (21.05.2026).
 */

import 'server-only'

export type VatEmailData = {
  order_number: string // "ZIO-2026-0005"
  client_name: string // "Imperial Burger sp. z o.o."
  contact_person: string | null
  vat_number: string // "FV/05/2026" (з Fakturownia)
  total_brutto: number
  total_net: number
  vat_amount: number
  vat_view_url?: string // Fakturownia preview URL
}

export function renderVatEmail(data: VatEmailData) {
  const subject = `Faktura VAT ${data.vat_number} — zamówienie ${data.order_number}`

  const greeting = data.contact_person
    ? `Dzień dobry ${escapeHtml(data.contact_person)},`
    : 'Dzień dobry,'

  const fmtPln = (n: number) =>
    n.toLocaleString('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' zł'

  const html = `
<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1e293b; line-height: 1.5; max-width: 600px; margin: 0 auto; padding: 24px; }
  .header { border-bottom: 3px solid #059669; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { margin: 0; color: #1e293b; font-size: 22px; }
  .header .brand { color: #059669; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .order-box { background: #d1fae5; border: 1px solid #6ee7b7; border-radius: 8px; padding: 16px; margin: 16px 0; }
  .order-box .label { font-size: 11px; text-transform: uppercase; color: #065f46; font-weight: 600; letter-spacing: 0.05em; }
  .order-box .number { font-family: monospace; font-size: 18px; font-weight: bold; color: #1e293b; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  td { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
  td.label { color: #64748b; font-size: 13px; }
  td.value { text-align: right; font-weight: 600; }
  td.total { font-size: 18px; padding-top: 12px; }
  .ksef-note { background: #eff6ff; border-left: 3px solid #2563eb; padding: 10px 14px; margin: 16px 0; font-size: 13px; color: #1e40af; border-radius: 0 6px 6px 0; }
  .footer { color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; }
  .footer strong { color: #1e293b; }
  .contact { background: #f8fafc; border-radius: 6px; padding: 12px; margin: 12px 0; font-size: 13px; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">DAGOLD</div>
    <h1>Faktura VAT — ${escapeHtml(data.vat_number)}</h1>
  </div>

  <p>${greeting}</p>

  <p>W załączniku przesyłamy fakturę VAT do zrealizowanego zamówienia <strong>${escapeHtml(data.order_number)}</strong>.</p>

  <div class="order-box">
    <div class="label">Numer faktury VAT</div>
    <div class="number">${escapeHtml(data.vat_number)}</div>
  </div>

  <table>
    <tr><td class="label">Nabywca:</td><td class="value">${escapeHtml(data.client_name)}</td></tr>
    <tr><td class="label">Zamówienie:</td><td class="value">${escapeHtml(data.order_number)}</td></tr>
    <tr><td class="label">Wartość netto:</td><td class="value">${fmtPln(data.total_net)}</td></tr>
    <tr><td class="label">VAT:</td><td class="value">${fmtPln(data.vat_amount)}</td></tr>
    <tr><td class="label total">Razem brutto:</td><td class="value total">${fmtPln(data.total_brutto)}</td></tr>
  </table>

  <p>📎 <strong>Faktura VAT w załączniku</strong> jako plik PDF.</p>

  ${
    data.vat_view_url
      ? `<p>🔗 Lub przejrzyj online: <a href="${escapeHtml(data.vat_view_url)}">${escapeHtml(data.vat_view_url)}</a></p>`
      : ''
  }

  <div class="ksef-note">
    ℹ️ Faktura została automatycznie wysłana do <strong>Krajowego Systemu e-Faktur (KSeF)</strong>
    zgodnie z obowiązującymi przepisami.
  </div>

  <div class="contact">
    <strong>Kontakt:</strong><br>
    Vadym Rotai<br>
    📞 +48 510 924 301<br>
    ✉️ <a href="mailto:vasin@dagold.com">vasin@dagold.com</a>
  </div>

  <div class="footer">
    DAGOLD Sp. z o.o.<br>
    ul. Wyględowska 8/51, 02-654 Warszawa<br>
    NIP: 5214088667 · KRS: 0001130039
  </div>
</body>
</html>
`

  const text = `${greeting}

W załączniku przesyłamy fakturę VAT do zrealizowanego zamówienia ${data.order_number}.

Numer faktury VAT: ${data.vat_number}
Nabywca: ${data.client_name}

Wartość netto: ${fmtPln(data.total_net)}
VAT: ${fmtPln(data.vat_amount)}
Razem brutto: ${fmtPln(data.total_brutto)}

Faktura VAT w załączniku PDF.
${data.vat_view_url ? `Link online: ${data.vat_view_url}` : ''}

Faktura została automatycznie wysłana do Krajowego Systemu e-Faktur (KSeF)
zgodnie z obowiązującymi przepisami.

Kontakt:
Vadym Rotai
+48 510 924 301
vasin@dagold.com

—
DAGOLD Sp. z o.o.
ul. Wyględowska 8/51, 02-654 Warszawa
NIP: 5214088667 · KRS: 0001130039
`

  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
