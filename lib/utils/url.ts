// lib/utils/url.ts
// Wspólny helper normalizacji URL do wyświetlania linków (href).
// Wydzielony z działającego wzorca contact-section-v3.tsx:140
// (value.startsWith('http') ? value : 'https://'+value).
//
// UWAGA: bez walidacji hosta — to celowo. Walidacja (host ma kropkę,
// strip path) zostaje LOKALNIE w app/api/clients/[id]/website/route.ts,
// bo tam chroni zapis do DB. Tu tylko zapewniamy schemat dla <a href>,
// żeby przeglądarka nie traktowała adresu jako ścieżki względnej (404).

export function normalizeUrl(raw: string): string {
  if (!raw) return ''
  const v = raw.trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  return `https://${v}`
}
