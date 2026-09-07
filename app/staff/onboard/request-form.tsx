'use client'

// app/staff/onboard/request-form.tsx — pending user tworzy własny wpis staff.
// Tylko imię (email z sesji). Po wysłaniu → ekran oczekiwania (refresh strony).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestStaffAccess } from '@/app/staff/actions'

export function RequestForm({ email }: { email: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await requestStaffAccess(name)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">
        Zalogowano jako <b>{email}</b>. Poproś o dostęp pracownika — Vadym
        zatwierdzi ręcznie.
      </p>
      <label className="block text-sm font-medium text-slate-700">
        Imię i nazwisko
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jan Kowalski"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#1F3A5F] focus:outline-none"
        />
      </label>
      {error && (
        <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-[#1F3A5F] px-4 py-2 text-sm font-medium text-white hover:bg-[#16304f] disabled:opacity-50"
      >
        {loading ? 'Wysyłanie…' : 'Poproś o dostęp'}
      </button>
    </form>
  )
}
