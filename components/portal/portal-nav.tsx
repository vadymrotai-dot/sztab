'use client'

// components/portal/portal-nav.tsx — Portal klienta: nawigacja sekcji (struktura A).
// Ciemnogranatowy header DAGOLD + taby. Ukryta na /portal/login i /portal/onboard.

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const TABS = [
  { href: '/portal', label: 'Pulpit', exact: true },
  { href: '/portal/zamowienie', label: 'Zamów' },
  { href: '/portal/historia', label: 'Historia' },
  { href: '/portal/dane', label: 'Moje dane' },
]

export function PortalNav() {
  const pathname = usePathname()
  const router = useRouter()

  if (pathname === '/portal/login' || pathname === '/portal/onboard') {
    return null
  }

  const logout = async () => {
    await createClient().auth.signOut()
    router.push('/portal/login')
    router.refresh()
  }

  const isActive = (t: (typeof TABS)[number]) =>
    t.exact ? pathname === t.href : pathname.startsWith(t.href)

  return (
    <header style={{ backgroundColor: '#1F3A5F' }} className="text-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold">DAGOLD</span>
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  isActive(t)
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
        <button
          onClick={logout}
          className="text-sm text-white/70 hover:text-white"
        >
          Wyloguj
        </button>
      </div>
    </header>
  )
}
