'use client'

// app/auth/token-redirect/page.tsx — cel logowania dla linkow generowanych
// przez admina (portal-admin.ts -> generatePortalLoginLink). Takie linki NIE
// obsluguja PKCE (brak code_verifier w przegladarce — link tworzy serwer, nie
// klient), wiec po weryfikacji Supabase przekierowuje z tokenami w hash
// fragmencie (#access_token=...&refresh_token=...), ktorego serwer nigdy nie
// widzi. Dlatego to osobna strona kliencka — /auth/callback (route.ts)
// obsluguje tylko ?code=, dla self-service OTP klientow (PKCE, dziala inaczej).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TokenRedirectPage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let done = false
    ;(async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const search = new URLSearchParams(window.location.search)
      const next = search.get('next') || '/'

      const hashError = hash.get('error_description') || hash.get('error')
      if (hashError) {
        setError(decodeURIComponent(hashError.replace(/\+/g, ' ')))
        return
      }

      const access_token = hash.get('access_token')
      const refresh_token = hash.get('refresh_token')
      if (!access_token || !refresh_token) {
        setError('Brak tokenu logowania w linku.')
        return
      }

      const { error: sessionError } = await createClient().auth.setSession({
        access_token,
        refresh_token,
      })
      if (sessionError) {
        setError(sessionError.message)
        return
      }
      if (!done) {
        window.location.assign(next)
      }
    })()
    return () => {
      done = true
    }
  }, [])

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-2 text-2xl font-bold text-[#1F3A5F]">DAGOLD</div>
      {error ? (
        <>
          <p className="text-sm text-red-600">{error}</p>
          <p className="mt-2 text-sm text-slate-600">
            Link mogl wygasnac lub byl juz uzyty. Popros o nowy link logowania.
          </p>
          <a href="/portal/login" className="mt-4 text-sm text-[#1F3A5F] underline">
            Przejdz do logowania
          </a>
        </>
      ) : (
        <p className="text-sm text-slate-600">Logowanie…</p>
      )}
    </div>
  )
}
