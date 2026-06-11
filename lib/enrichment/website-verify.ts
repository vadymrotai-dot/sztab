// lib/enrichment/website-verify.ts
// Anty-halucynacja WWW (fix 11.06.2026).
//
// Przed zapisem website z JAKIEGOKOLWIEK automatycznego źródła (web-search /
// tavily_brand / apify) sprawdzamy, czy domena REALNIE istnieje i odpowiada.
// DNS-fail / timeout / 4xx / 5xx → false → NIE zapisujemy (i nie pozwalamy
// AI twierdzić, że firma "posiada stronę").
//
// Mechanizm: fetch HEAD (fallback GET) z 5s timeout. DNS-fail rzuca w fetch →
// łapiemy → false. 2xx-3xx → true.

export async function verifyWebsiteLive(
  url: string | null | undefined,
): Promise<boolean> {
  if (!url || typeof url !== 'string') return false

  let target: string
  try {
    const u = new URL(url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    if (!u.hostname.includes('.')) return false
    target = u.toString()
  } catch {
    return false
  }

  // HEAD najpierw (tanio); część serwerów blokuje HEAD → fallback GET.
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const res = await fetch(target, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(5_000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SztabBot/1.0)' },
      })
      if (res.status >= 200 && res.status < 400) return true
      // 4xx/5xx na GET → martwa; na HEAD (405/403) → spróbuj GET.
      if (method === 'GET') return false
    } catch {
      // DNS-fail / timeout / network: na HEAD spróbuj GET, na GET → martwa.
      if (method === 'GET') return false
    }
  }
  return false
}
