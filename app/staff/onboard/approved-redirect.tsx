'use client'

// app/staff/onboard/approved-redirect.tsx — konto zatwierdzone, ale JWT może
// jeszcze nie mieć role='staff' (lag po updateUserById). refreshSession()
// pobiera nowy access_token z aktualnym app_metadata → twardy redirect na '/'
// (middleware widzi role='staff' → wpuszcza). BEZ relogowania.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ApprovedRedirect() {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let done = false
    ;(async () => {
      try {
        await createClient().auth.refreshSession()
      } catch {
        /* ignore — spróbujemy nawigować mimo to */
      }
      if (!done) {
        // Twarda nawigacja, żeby middleware przeliczył z nowym cookie.
        window.location.assign('/')
      }
    })()
    // Fallback: jeśli po 4s wciąż tu jesteśmy (pętla), pokaż link ręczny.
    const t = setTimeout(() => setFailed(true), 4000)
    return () => {
      done = true
      clearTimeout(t)
    }
  }, [])

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-2 text-2xl font-bold text-[#1F3A5F]">DAGOLD</div>
      <p className="text-sm text-slate-600">
        Konto zatwierdzone — wchodzimy do panelu…
      </p>
      {failed && (
        <a href="/" className="mt-4 text-sm text-[#1F3A5F] underline">
          Kliknij, jeśli nie przekierowało automatycznie
        </a>
      )}
    </div>
  )
}
