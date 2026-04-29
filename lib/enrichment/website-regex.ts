// lib/enrichment/website-regex.ts
// Sprint N Phase B2 — regex-only contact extractor (no AI cost).
// Complements lib/enrichment/website.ts (AI-driven persons extractor).

const PAGE_PATHS = ['', '/kontakt', '/contact', '/o-nas']
const FETCH_TIMEOUT_MS = 10_000

const UA = 'Mozilla/5.0 (Sztab/1.0; +mailto:vadymrotai@gmail.com)'

export interface WebsiteRegexResult {
  url: string
  pages_fetched: string[]
  phones: string[]
  emails: string[]
  facebook_url: string | null
  instagram_url: string | null
  linkedin_url: string | null
  address_lines: string[]
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.slice(0, 200_000) // cap at 200KB per page
  } catch {
    return null
  }
}

/** Polish phone formats:
 *   +48 12 345 67 89 / +48 12-345-67-89 / 12 345 67 89 / 12-345-67-89 / 123 456 789
 *  9-digit core preceded optionally by +48 or 0048, у будь-якому format.
 */
function extractPhones(html: string): string[] {
  const text = html
  const patterns = [
    /(?:\+48[\s\-.]?|0048[\s\-.]?|tel\.?\s*:?\s*)(\d{2,3}[\s\-.]?\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2})/gi,
    /(?:tel\.?\s*:?\s*|telefon\s*:?\s*)(\d{3}[\s\-.]?\d{3}[\s\-.]?\d{3})/gi,
    /(\+48[\s\-.]?\d{3}[\s\-.]?\d{3}[\s\-.]?\d{3})/g,
  ]
  const found = new Set<string>()
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const raw = m[0].replace(/(?:tel\.?\s*:?\s*|telefon\s*:?\s*)/i, '').trim()
      const normalized = normalizePhone(raw)
      if (normalized && normalized.length >= 9) found.add(normalized)
    }
  }
  return [...found]
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '')
  if (digits.length < 9) return null
  // Strip leading 0048 → +48
  if (digits.startsWith('0048')) return '+48' + digits.slice(4)
  if (digits.startsWith('48') && digits.length === 11) return '+' + digits
  if (digits.startsWith('+48')) return digits
  if (digits.length === 9) return '+48' + digits
  if (digits.startsWith('+')) return digits
  return digits
}

function extractEmails(html: string): string[] {
  const re = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const email = m[1]!.toLowerCase()
    // Filter common false positives
    if (email.includes('example.com') || email.includes('domain.com')) continue
    if (email.endsWith('.png') || email.endsWith('.jpg') || email.endsWith('.svg')) continue
    if (email.startsWith('image@') || email.startsWith('photo@')) continue
    found.add(email)
  }
  return [...found]
}

function extractSocial(html: string): { fb: string | null; ig: string | null; li: string | null } {
  const fbMatch = html.match(
    /https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share|tr|plugins)([A-Za-z0-9._-]+)/i,
  )
  const igMatch = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/i)
  const liMatch = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([A-Za-z0-9._-]+)/i)
  return {
    fb: fbMatch ? `https://facebook.com/${fbMatch[1]}` : null,
    ig: igMatch ? `https://instagram.com/${igMatch[1]}` : null,
    li: liMatch ? `https://linkedin.com/${liMatch[0].includes('/in/') ? 'in' : 'company'}/${liMatch[1]}` : null,
  }
}

/** PL ulica regex — best-effort. */
function extractAddressLines(text: string): string[] {
  const re = /(?:ul\.|al\.|os\.|pl\.)\s*[A-ZŁŚĆŻŹÓŃ][^\n,;]{2,80}\s+\d+[A-Za-z]?(?:\s*\/\s*\d+)?/g
  const out = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.add(m[0].trim())
    if (out.size >= 3) break
  }
  return [...out]
}

export async function extractWebsiteRegex(baseUrl: string): Promise<WebsiteRegexResult> {
  const result: WebsiteRegexResult = {
    url: baseUrl,
    pages_fetched: [],
    phones: [],
    emails: [],
    facebook_url: null,
    instagram_url: null,
    linkedin_url: null,
    address_lines: [],
  }

  const cleanedBase = baseUrl.replace(/\/$/, '')
  const allPhones = new Set<string>()
  const allEmails = new Set<string>()
  const allAddresses = new Set<string>()

  for (const path of PAGE_PATHS) {
    const url = `${cleanedBase}${path}`
    const html = await fetchPage(url)
    if (!html) continue
    result.pages_fetched.push(url)

    extractPhones(html).forEach((p) => allPhones.add(p))
    extractEmails(html).forEach((e) => allEmails.add(e))

    const social = extractSocial(html)
    if (!result.facebook_url && social.fb) result.facebook_url = social.fb
    if (!result.instagram_url && social.ig) result.instagram_url = social.ig
    if (!result.linkedin_url && social.li) result.linkedin_url = social.li

    const text = stripHtml(html)
    extractAddressLines(text).forEach((a) => allAddresses.add(a))
  }

  result.phones = [...allPhones]
  result.emails = [...allEmails]
  result.address_lines = [...allAddresses]
  return result
}
