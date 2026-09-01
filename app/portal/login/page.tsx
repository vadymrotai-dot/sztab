'use client'

// app/portal/login/page.tsx — Portal klienta. Logowanie: HASŁO (główne) +
// magic link (link poniżej / dla pierwszego logowania i odzyskiwania).
//   - hasło: signInWithPassword → /portal
//   - magic link: signInWithOtp → /auth/callback?next=/portal/onboard (bez zmian)

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function PortalLoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loginPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (error) {
      setError('Nieprawidłowy e-mail lub hasło. Możesz też zalogować się linkiem.')
      return
    }
    router.push('/portal')
    router.refresh()
  }

  const loginMagic = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await createClient().auth.signInWithOtp({
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
      ) : mode === 'password' ? (
        <form onSubmit={loginPassword} className="space-y-4">
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
          <label className="block text-sm font-medium text-slate-700">
            Hasło
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Twoje hasło"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#1F3A5F] focus:outline-none"
            />
          </label>
          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full rounded-md bg-[#1F3A5F] px-4 py-2 text-sm font-medium text-white hover:bg-[#16304f] disabled:opacity-50"
          >
            {loading ? 'Logowanie…' : 'Zaloguj'}
          </button>
          <p className="text-center text-xs text-slate-500">
            <button
              type="button"
              onClick={() => {
                setMode('magic')
                setError(null)
              }}
              className="text-[#1F3A5F] underline"
            >
              Zaloguj przez jednorazowy link e-mail
            </button>
          </p>
          <p className="text-center text-xs text-slate-400">
            Nie masz hasła? Zaloguj linkiem, a hasło ustawisz w „Moje dane".
          </p>
        </form>
      ) : (
        <form onSubmit={loginMagic} className="space-y-4">
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
            <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || !email}
            className="w-full rounded-md bg-[#1F3A5F] px-4 py-2 text-sm font-medium text-white hover:bg-[#16304f] disabled:opacity-50"
          >
            {loading ? 'Wysyłanie…' : 'Wyślij link logowania'}
          </button>
          <p className="text-center text-xs text-slate-500">
            <button
              type="button"
              onClick={() => {
                setMode('password')
                setError(null)
              }}
              className="text-[#1F3A5F] underline"
            >
              Wróć do logowania hasłem
            </button>
          </p>
          <p className="text-center text-xs text-slate-400">
            Jednorazowy link — bez hasła, na e-mail.
          </p>
        </form>
      )}
    </div>
  )
}
