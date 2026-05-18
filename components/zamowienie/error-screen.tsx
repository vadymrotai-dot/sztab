// components/zamowienie/error-screen.tsx
// Sprint S-ORDER.1.B.2 — public form error states (3 variants).

'use client'

import { AlertCircle, CheckCircle2, FileX } from 'lucide-react'

type Variant = 'not-found' | 'already-submitted' | 'error'

const VARIANTS = {
  'not-found': {
    icon: FileX,
    iconColor: 'text-slate-400',
    bgColor: 'bg-slate-50',
    title: 'Nie znaleziono zamówienia',
    description:
      'Link, którego używasz, jest nieprawidłowy lub wygasł. Skontaktuj się z Vadymem w celu otrzymania nowego linku.',
  },
  'already-submitted': {
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    bgColor: 'bg-emerald-50',
    title: 'Zamówienie zostało już złożone',
    description:
      'Twoje zamówienie czeka na realizację. Vadym skontaktuje się w celu potwierdzenia szczegółów.',
  },
  error: {
    icon: AlertCircle,
    iconColor: 'text-rose-500',
    bgColor: 'bg-rose-50',
    title: 'Wystąpił błąd',
    description:
      'Spróbuj odświeżyć stronę. Jeśli problem się powtarza, zadzwoń do Vadyma: +48 733 050 568',
  },
} as const

export function ErrorScreen({
  variant,
  orderNumber,
  message,
}: {
  variant: Variant
  orderNumber?: string
  message?: string
}) {
  const v = VARIANTS[variant]
  const Icon = v.icon

  return (
    <div className="mx-auto max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="bg-[#1F2B4A] text-white px-5 py-4">
        <div className="text-xs tracking-widest opacity-70">ZIOMEK·FISH</div>
        <div className="text-lg font-bold">Czudowa Marka</div>
      </div>
      <div className="p-8 text-center">
        <div
          className={`w-16 h-16 mx-auto rounded-full ${v.bgColor} flex items-center justify-center mb-4`}
        >
          <Icon className={`w-8 h-8 ${v.iconColor}`} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">{v.title}</h2>
        <p className="text-sm text-slate-600 leading-relaxed">{v.description}</p>
        {orderNumber && (
          <div className="mt-4 inline-block bg-slate-100 px-4 py-2 rounded-lg font-mono text-sm font-bold text-slate-900">
            {orderNumber}
          </div>
        )}
        {message && <div className="mt-4 text-xs text-slate-500">{message}</div>}
      </div>
    </div>
  )
}
