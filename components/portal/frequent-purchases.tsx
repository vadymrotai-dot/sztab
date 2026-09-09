// components/portal/frequent-purchases.tsx — pasek "Twoje częste zakupy" na
// Pulpit. Pozioma przewijana lista mini-kart (placeholder zdjęcia + nazwa +
// gramatura + ŻYWA cena). Klik → /portal/zamowienie (v1, bez deep-link add).
// Server component (linki, bez interakcji).

import Link from 'next/link'
import { ProductThumb } from './product-thumb'
import type { FrequentProduct } from '@/lib/portal/frequent'

function pln(n: number | null): string {
  return n == null ? '—' : `${Number(n).toFixed(2)} zł`
}

export function FrequentPurchases({ items }: { items: FrequentProduct[] }) {
  if (!items || items.length === 0) return null

  return (
    <section className="mb-6">
      <div className="mb-2 text-[13px] font-medium text-slate-500">
        Twoje częste zakupy
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {items.map((p) => (
          <Link
            key={p.id}
            href="/portal/zamowienie"
            className="w-[150px] shrink-0 rounded-lg border border-[#E5E1D8] bg-white p-2 transition hover:border-[var(--brand-primary)]/40 hover:shadow-sm"
          >
            <ProductThumb size="card" />
            <div className="mt-2 line-clamp-2 min-h-[34px] text-[13px] font-medium leading-tight text-slate-800">
              {p.name}
            </div>
            {p.gramatura && (
              <div className="text-[11px] text-slate-400">{p.gramatura}</div>
            )}
            <div className="mt-1 text-[13px] font-bold text-[var(--brand-primary)]">
              {pln(p.price)}
              {p.price != null && (
                <span className="text-[11px] font-normal text-slate-400">
                  /{p.unit || 'szt'}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
