// lib/lookup/dispatcher.ts
// Sprint O Phase 6 — input-type detection для AddCompanyModal.

export type InputType = 'nip' | 'regon' | 'krs' | 'email' | 'phone' | 'url' | 'name_text'

export function detectInputType(input: string): InputType {
  const trimmed = input.trim()
  const cleaned = trimmed.replace(/[\s-]/g, '')

  // KRS: 10 digits з leading zeros (typical KRS layout). Check before NIP because
  // both 10-digit; KRS distinguishable by 0000 prefix typical у polish KRS.
  if (/^\d{10}$/.test(cleaned) && cleaned.startsWith('00')) return 'krs'

  // NIP: 10 digits, no leading 0
  if (/^\d{10}$/.test(cleaned)) return 'nip'

  // REGON: 9 OR 14 digits
  if (/^\d{9}$/.test(cleaned) || /^\d{14}$/.test(cleaned)) return 'regon'

  // Email
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(trimmed)) return 'email'

  // Polish phone: optional +48 / 0048, then 9 digits
  if (/^(\+?48|0048)?[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}$/.test(cleaned)) return 'phone'

  // URL — http(s) prefix OR domain shape
  if (/^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)) return 'url'
  if (/[a-z0-9-]+\.(pl|com|eu|net|org|info|biz|shop|store|sklep|app)(\b|\/)/i.test(trimmed))
    return 'url'

  return 'name_text'
}

export function normalizeNip(input: string): string {
  return input.replace(/[\s-]/g, '')
}

export function extractDomain(input: string): string | null {
  const match = input.toLowerCase().match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i)
  return match ? match[1] ?? null : null
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '')
  if (digits.startsWith('0048')) return '+48' + digits.slice(4)
  if (digits.startsWith('48') && digits.length === 11) return '+' + digits
  if (digits.startsWith('+')) return digits
  if (digits.length === 9) return '+48' + digits
  return digits
}
