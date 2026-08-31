'use client'

// app/portal/onboard/nip-form.tsx — formularz NIP przy rejestracji portalu.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { registerPortalAccount } from '../actions'

export function NipForm({ email }: { email: string }) {
  const router = useRouter()
  const [nip, setNip] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await registerPortalAccount(nip)
    setLoading(false)
    if (res.ok) router.refresh()
    else setError(res.error)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">
        Zalogowano jako <b>{email}</b>. Podaj NIP swojej firmy, aby powiązać
        konto z Twoimi cenami.
      </p>
      <label className="block text-sm font-medium text-slate-700">
        NIP firmy
        <input
          inputMode="numeric"
          required
          value={nip}
          onChange={(e) => setNip(e.target.value)}
          placeholder="np. 5223239864"
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
        disabled={loading || !nip}
        className="w-full rounded-md bg-[#1F3A5F] px-4 py-2 text-sm font-medium text-white hover:bg-[#16304f] disabled:opacity-50"
      >
        {loading ? 'Wysyłanie…' : 'Zarejestruj konto'}
      </button>
      <p className="text-center text-xs text-slate-400">
        Konto wymaga ręcznego zatwierdzenia przez DAGOLD przed dostępem do cen.
      </p>
    </form>
  )
}
