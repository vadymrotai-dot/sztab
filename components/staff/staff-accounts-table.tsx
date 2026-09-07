'use client'

// components/staff/staff-accounts-table.tsx — lista kont pracowników + akcje
// approve/reject. Mirror portal-accounts, ale osobne (blast radius: pełny dostęp).

import { useState, useTransition } from 'react'
import { approveStaffAccount, rejectStaffAccount } from '@/app/staff/actions'

export type StaffAccountRow = {
  id: string
  email: string
  name: string | null
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  approved_at: string | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Oczekuje', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Zatwierdzony', cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'Odrzucony', cls: 'bg-slate-100 text-slate-500' },
}

function dt(s: string): string {
  try {
    return new Date(s).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })
  } catch {
    return s
  }
}

export function StaffAccountsTable({ rows }: { rows: StaffAccountRow[] }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Brak zgłoszeń pracowników.</p>
  }

  const approve = (id: string) =>
    start(async () => {
      setError(null)
      const res = await approveStaffAccount(id)
      if (!res.ok) setError(res.error)
    })

  const reject = (id: string) =>
    start(async () => {
      setError(null)
      if (!confirm('Odrzucić / cofnąć dostęp temu pracownikowi?')) return
      const res = await rejectStaffAccount(id)
      if (!res.ok) setError(res.error)
    })

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}
      <div className="rounded-lg border border-[#E5E1D8] bg-white">
        {rows.map((r, i) => {
          const st = STATUS[r.status] ?? { label: r.status, cls: 'bg-slate-100' }
          return (
            <div
              key={r.id}
              className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
                i < rows.length - 1 ? 'border-b border-[#F0F0F0]' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">
                  {r.name || r.email}
                </div>
                <div className="truncate text-xs text-slate-400">
                  {r.email} · {dt(r.requested_at)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                  {st.label}
                </span>
                {r.status !== 'approved' && (
                  <button
                    onClick={() => approve(r.id)}
                    disabled={pending}
                    className="rounded-md bg-[#1F3A5F] px-3 py-1 text-xs font-medium text-white hover:bg-[#16304f] disabled:opacity-50"
                  >
                    Zatwierdź
                  </button>
                )}
                {r.status !== 'rejected' && (
                  <button
                    onClick={() => reject(r.id)}
                    disabled={pending}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {r.status === 'approved' ? 'Cofnij' : 'Odrzuć'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
