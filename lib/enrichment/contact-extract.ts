// lib/enrichment/contact-extract.ts
// Ekstrakcja telefonu/emaila z treści stron (katalogi / website) — fix 11.06.2026.
//
// Phase B znajduje katalogi (jadlodawcy.pl, multi-restauracje.pl) i scrapuje
// strony, ale kontakty nie były wyciągane (telefon/email zostawały 'manual').
// Ten moduł parsuje treść regexem PL i zwraca znormalizowane kontakty.

export type ExtractedContacts = {
  phones: string[] // 9-cyfrowe, znormalizowane (bez +48/spacji)
  emails: string[] // lowercase, zdeduplikowane
}

// Email — prosty, odfiltrowane rozszerzenia plików (foo@2x.png itp.).
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
// Telefon PL — opcjonalny +48, 9 cyfr rozdzielonych spacją/myślnikiem.
const PHONE_RE = /(?:\+?48[\s-]?)?(?:\d[\s-]?){9}/g

/** Normalizuj PL telefon → 9 cyfr (lub null gdy niepoprawny). */
export function normalizePhonePl(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('48') && d.length === 11) d = d.slice(2)
  if (d.startsWith('0') && d.length === 10) d = d.slice(1)
  return d.length === 9 ? d : null
}

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase()
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return null
  if (/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e)) return null
  return e
}

/** Wyciągnij kontakty z dowolnej treści (HTML/tekst/snippety). */
export function extractContacts(
  text: string | null | undefined,
): ExtractedContacts {
  if (!text || typeof text !== 'string') return { phones: [], emails: [] }

  const emails: string[] = []
  for (const m of text.match(EMAIL_RE) ?? []) {
    const e = normalizeEmail(m)
    if (e && !emails.includes(e)) emails.push(e)
  }

  const phones: string[] = []
  for (const m of text.match(PHONE_RE) ?? []) {
    const n = normalizePhonePl(m)
    if (n && !phones.includes(n)) phones.push(n)
  }

  return { phones, emails }
}
