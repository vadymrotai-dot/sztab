'use client'

// app/staff/login/page.tsx — samorejestracja/logowanie pracownika.
// Magic link (signInWithOtp) → /auth/callback?next=/staff/onboard.
// Osobne od /portal/login. signInWithOtp na nowy email tworzy auth.users
// automatycznie (shouldCreateUser domyślnie true) — jak w portalu.

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function StaffLoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/staff/onboard`,
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
        <div className="text-sm text-slate-500">Panel pracownika</div>
      </div>

      {sent ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center text-sm text-green-800">
          Wysłaliśmy link logowania na <b>{email}</b>. Otwórz e-mail i kliknij
          link, aby kontynuować.
        </div>
      ) : (
        <form onSubmit={login} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Adres e-mail
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="imie@dagold.com"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#1F3A5F] focus:outline-none"
            />
          </label>
          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || !email}
            className="w-full rounded-md bg-[#1F3A5F] px-4 py-2 text-sm font-medium text-white hover:bg-[#16304f] disabled:opacity-50"
          >
            {loading ? 'Wysyłanie…' : 'Wyślij link logowania'}
          </button>
          <p className="text-center text-xs text-slate-400">
            Dostęp wymaga zatwierdzenia przez DAGOLD po pierwszym logowaniu.
          </p>
        </form>
      )}
    </div>
  )
}
