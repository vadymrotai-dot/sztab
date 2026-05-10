// lib/clients/client-type-meta.ts
// Sprint S6D Day 1 BUGFIX (11.05.2026) — extracted CLIENT_TYPE_META з
// components/clients/client-type-badge.tsx ('use client') до plain server-OK
// module.
//
// WHY: Next.js 15 RSC barrier — 'use client' modules ONLY proxy component
// exports do Server Components. Plain values (CLIENT_TYPE_META object) come
// through як undefined → page crashed on .label_pl access in chip render.
//
// Fix: keep metadata тут (no 'use client'), імпортувати з обох сторін.

import type { ClientType } from '@/lib/ai/business-analysis'

interface TypeMeta {
  emoji: string
  label_pl: string
  /** Tailwind background class — kolor-coded per category */
  bgClass: string
}

export const CLIENT_TYPE_META: Record<ClientType, TypeMeta> = {
  gastronomia: { emoji: '🍔', label_pl: 'Gastronomia', bgClass: 'bg-orange-100 text-orange-900 border-orange-300' },
  hurtownia: { emoji: '📦', label_pl: 'Hurtownia', bgClass: 'bg-blue-100 text-blue-900 border-blue-300' },
  sklep_detal: { emoji: '🏪', label_pl: 'Sklep detaliczny', bgClass: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  catering: { emoji: '🥗', label_pl: 'Catering', bgClass: 'bg-lime-100 text-lime-900 border-lime-300' },
  hotel: { emoji: '🏨', label_pl: 'Hotel', bgClass: 'bg-violet-100 text-violet-900 border-violet-300' },
  instytucja: { emoji: '🏛', label_pl: 'Instytucja', bgClass: 'bg-slate-100 text-slate-900 border-slate-300' },
  production: { emoji: '🏭', label_pl: 'Producent', bgClass: 'bg-amber-100 text-amber-900 border-amber-300' },
  sieci_handlowe: { emoji: '🛒', label_pl: 'Sieci handlowe', bgClass: 'bg-cyan-100 text-cyan-900 border-cyan-300' },
  inne: { emoji: '📋', label_pl: 'Inne', bgClass: 'bg-gray-100 text-gray-900 border-gray-300' },
}

/** Display order для UI dropdowns + chip rows. */
export const CLIENT_TYPE_ORDER: ClientType[] = [
  'gastronomia',
  'hurtownia',
  'sklep_detal',
  'catering',
  'hotel',
  'instytucja',
  'production',
  'sieci_handlowe',
  'inne',
]
