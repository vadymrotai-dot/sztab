/**
 * Email template для proforma faktura після order submit.
 *
 * Sent FROM: DAGOLD <zamowienia@sztabapp.com>
 * BCC: vasin@dagold.com (Vadym дістає копію всіх emailів)
 *
 * Content:
 * - Header з brand (DAGOLD)
 * - Подяка за zamówienie
 * - Order number (ZIO-XXX)
 * - Total breakdown
 * - Termin płatności
 * - PDF attached
 * - Contact info (Vadym phone + email)
 *
 * Sprint S-ORDER.2.A.2 (19.05.2026).
 */

import 'server-only'

export type ProformaEmailData = {
  order_number: string // "ZIO-2026-0001"
  client_name: string // "JEŻ Jedzenie Zdrowe"
  contact_person: string | null // "Vadym Rotai"
  proforma_number: string // "P05/05/2026" (з Fakturownia)
  total_brutto: number // 1449.54
  total_net: number // 1380.51
  vat_amount: number // 69.03
  payment_to_days: number // 14
  payment_to_date: string // "2026-06-02" (ISO date)
  proforma_view_url?: string // Fakturownia preview URL
}

export function renderProformaEmail(data: ProformaEmailData) {
  const subject = `Potwierdzenie zamówienia ${data.order_number} — DAGOLD`

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
  .header { border-bottom: 3px solid #d97706; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { margin: 0; color: #1e293b; font-size: 22px; }
  .header .brand { color: #d97706; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .order-box { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 16px 0; }
  .order-box .label { font-size: 11px; text-transform: uppercase; color: #92400e; font-weight: 600; letter-spacing: 0.05em; }
  .order-box .number { font-family: monospace; font-size: 18px; font-weight: bold; color: #1e293b; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  td { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
  td.label { color: #64748b; font-size: 13px; }
  td.value { text-align: right; font-weight: 600; }
  td.total { font-size: 18px; padding-top: 12px; }
  .footer { color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; }
  .footer strong { color: #1e293b; }
  .contact { background: #f8fafc; border-radius: 6px; padding: 12px; margin: 12px 0; font-size: 13px; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">DAGOLD</div>
    <h1>Potwierdzenie zamówienia</h1>
  </div>

  <p>${greeting}</p>

  <p>Dziękujemy za złożenie zamówienia. Poniżej podsumowanie:</p>

  <div class="order-box">
    <div class="label">Numer zamówienia</div>
    <div class="number">${escapeHtml(data.order_number)}</div>
  </div>

  <table>
    <tr><td class="label">Kupujący:</td><td class="value">${escapeHtml(data.client_name)}</td></tr>
    <tr><td class="label">Faktura Proforma:</td><td class="value">${escapeHtml(data.proforma_number)}</td></tr>
    <tr><td class="label">Wartość netto:</td><td class="value">${fmtPln(data.total_net)}</td></tr>
    <tr><td class="label">VAT:</td><td class="value">${fmtPln(data.vat_amount)}</td></tr>
    <tr><td class="label total">Razem brutto:</td><td class="value total">${fmtPln(data.total_brutto)}</td></tr>
    <tr><td class="label">Termin płatności:</td><td class="value">${data.payment_to_days} dni (${escapeHtml(data.payment_to_date)})</td></tr>
  </table>

  <p>📎 <strong>Faktura proforma w załączniku</strong> jako plik PDF.</p>

  ${
    data.proforma_view_url
      ? `<p>🔗 Lub przejrzyj online: <a href="${escapeHtml(data.proforma_view_url)}">${escapeHtml(data.proforma_view_url)}</a></p>`
      : ''
  }

  <div class="contact">
    <strong>Co dalej?</strong><br>
    1. Vadym skontaktuje się z Tobą telefonicznie w ciągu 24h aby potwierdzić szczegóły dostawy<br>
    2. Wysyłka 3-5 dni roboczych od potwierdzenia<br>
    3. Faktura VAT wystawiona w dniu wysyłki
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

Dziękujemy za złożenie zamówienia.

Numer zamówienia: ${data.order_number}
Faktura Proforma: ${data.proforma_number}
Kupujący: ${data.client_name}

Wartość netto: ${fmtPln(data.total_net)}
VAT: ${fmtPln(data.vat_amount)}
Razem brutto: ${fmtPln(data.total_brutto)}
Termin płatności: ${data.payment_to_days} dni (${data.payment_to_date})

Faktura proforma w załączniku PDF.
${data.proforma_view_url ? `Link online: ${data.proforma_view_url}` : ''}

Co dalej:
1. Vadym skontaktuje się telefonicznie w ciągu 24h
2. Wysyłka 3-5 dni od potwierdzenia
3. Faktura VAT w dniu wysyłki

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
