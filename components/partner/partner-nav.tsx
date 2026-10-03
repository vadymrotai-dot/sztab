'use client'

// components/partner/partner-nav.tsx — Portal partnera: prosty header +
// wylogowanie. Analog components/portal/portal-nav.tsx, uproszczony (bez
// tabów sekcji — lista + profil to jedyne dwa widoki na start).

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function PartnerNav({ partnerName }: { partnerName: string }) {
  const pathname = usePathname()
  const router = useRouter()

  if (pathname === '/partner-portal/login') return null

  const logout = async () => {
    await createClient().auth.signOut()
    router.push('/partner-portal/login')
    router.refresh()
  }

  return (
    <header className="border-b border-[#E5E1D8] bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/partner-portal" className="text-sm font-semibold text-[#1F3A5F]">
          Sztab — Portal partnera · {partnerName}
        </Link>
        <button
          onClick={logout}
          className="text-xs text-slate-500 underline hover:text-slate-700"
        >
          Wyloguj
        </button>
      </div>
    </header>
  )
}
