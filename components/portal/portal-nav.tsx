'use client'

// components/portal/portal-nav.tsx — Portal klienta Faza 1: nawigacja sekcji.
// Ukryta na /portal/login i /portal/onboard (przed zalogowaniem/zatwierdzeniem).

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const TABS = [
  { href: '/portal/zamowienie', label: 'Nowe zamówienie' },
  { href: '/portal/historia', label: 'Historia' },
  { href: '/portal/dane', label: 'Moje dane' },
]

export function PortalNav() {
  const pathname = usePathname()
  const router = useRouter()

  if (
    pathname === '/portal/login' ||
    pathname === '/portal/onboard' ||
    pathname === '/portal'
  ) {
    return null
  }

  const logout = async () => {
    await createClient().auth.signOut()
    router.push('/portal/login')
    router.refresh()
  }

  return (
    <header className="border-b border-[#E5E1D8] bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold text-[#1F3A5F]">DAGOLD</span>
          <nav className="flex gap-1">
            {TABS.map((t) => {
              const active = pathname.startsWith(t.href)
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    active
                      ? 'bg-[#1F3A5F] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {t.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <button
          onClick={logout}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          Wyloguj
        </button>
      </div>
    </header>
  )
}
