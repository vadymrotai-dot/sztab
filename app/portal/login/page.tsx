'use client'

// app/portal/login/page.tsx — Portal klienta Faza 0. Logowanie magic-linkiem.
// Bez hasła: signInWithOtp → email z linkiem → /auth/callback?next=/portal/onboard.

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function PortalLoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/portal/onboard`,
      },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="text-2xl font-bold text-[#1F3A5F]">DAGOLD</div>
        <div className="text-sm text-slate-500">Panel klienta</div>
      </div>

      {sent ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center text-sm text-green-800">
          Wysłaliśmy link logowania na <b>{email}</b>. Otwórz e-mail i kliknij
          link, aby się zalogować.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Adres e-mail
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kontakt@firma.pl"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#1F3A5F] focus:outline-none"
            />
          </label>
          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !email}
            className="w-full rounded-md bg-[#1F3A5F] px-4 py-2 text-sm font-medium text-white hover:bg-[#16304f] disabled:opacity-50"
          >
            {loading ? 'Wysyłanie…' : 'Wyślij link logowania'}
          </button>
          <p className="text-center text-xs text-slate-400">
            Logowanie bez hasła — wysyłamy jednorazowy link na e-mail.
          </p>
        </form>
      )}
    </div>
  )
}
