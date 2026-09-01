'use client'

// components/portal/portal-accounts-table.tsx — admin: zatwierdzanie kont portalu.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  approvePortalAccount,
  rejectPortalAccount,
  searchClientsForApproval,
  createClientFromNipAndApprove,
} from '@/app/actions/portal-admin'

export interface PortalAccountRow {
  id: string
  email: string
  nip_submitted: string | null
  status: string
  matched_client_id: string | null
  matched_title: string | null
  client_id: string | null
  requested_at: string
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}

function Row({ acc }: { acc: PortalAccountRow }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<
    { id: string; title: string; nip: string | null }[]
  >([])
  const [searching, setSearching] = useState(false)

  // Debounce — szukaj klienta po nazwie/NIP zamiast wpisywać UUID.
  useEffect(() => {
    if (acc.status !== 'pending') return
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    let active = true
    setSearching(true)
    const t = setTimeout(async () => {
      const r = await searchClientsForApproval(term)
      if (!active) return
      setSearching(false)
      if (r.ok) setResults(r.clients)
      else {
        setResults([])
        setErr(r.error)
      }
    }, 300)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [q, acc.status])

  const approveWith = async (clientId: string) => {
    setBusy(true)
    setErr(null)
    const r = await approvePortalAccount(acc.id, clientId)
    setBusy(false)
    if (r.ok) router.refresh()
    else setErr(r.error)
  }

  const createFromNip = async () => {
    setBusy(true)
    setErr(null)
    const r = await createClientFromNipAndApprove(acc.id)
    setBusy(false)
    if (r.ok) router.refresh()
    else setErr(r.error)
  }
  const reject = async () => {
    if (!confirm('Odrzucić to konto?')) return
    setBusy(true); setErr(null)
    const r = await rejectPortalAccount(acc.id)
    setBusy(false)
    if (r.ok) router.refresh(); else setErr(r.error)
  }

  return (
    <tr className="border-b border-[#EEE] text-sm">
      <td className="py-2 pr-3">
        <div className="font-medium text-slate-800">{acc.email}</div>
        <div className="text-[11px] text-slate-400">
          {new Date(acc.requested_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}
        </div>
      </td>
      <td className="py-2 pr-3 font-mono text-xs">{acc.nip_submitted ?? '—'}</td>
      <td className="py-2 pr-3">
        {acc.matched_title ? (
          <span className="text-green-700">{acc.matched_title}</span>
        ) : (
          <span className="text-slate-400">brak dopasowania</span>
        )}
      </td>
      <td className="py-2 pr-3"><StatusBadge status={acc.status} /></td>
      <td className="py-2">
        {acc.status === 'pending' ? (
          <div className="flex flex-col gap-1">
            {!acc.matched_client_id && acc.nip_submitted && (
              <button
                disabled={busy}
                onClick={createFromNip}
                className="mb-1 self-start rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                title="Pobierz dane z rejestru MF, utwórz klienta i zatwierdź"
              >
                {busy ? 'Tworzę…' : `Utwórz klienta z NIP ${acc.nip_submitted} i zatwierdź`}
              </button>
            )}
            <div className="flex items-start gap-2">
              <div className="relative">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Szukaj klienta — nazwa lub NIP…"
                  className="w-72 rounded border border-slate-300 px-2 py-1 text-xs"
                />
                {(results.length > 0 || searching) && (
                  <ul className="absolute z-20 mt-1 max-h-64 w-72 overflow-auto rounded border border-slate-200 bg-white shadow-lg">
                    {searching && (
                      <li className="px-2 py-1 text-[11px] text-slate-400">Szukam…</li>
                    )}
                    {results.map((c) => (
                      <li key={c.id}>
                        <button
                          disabled={busy}
                          onClick={() => approveWith(c.id)}
                          className="block w-full px-2 py-1.5 text-left text-xs hover:bg-green-50 disabled:opacity-50"
                          title="Zatwierdź i przypisz tego klienta"
                        >
                          <span className="font-medium text-slate-800">{c.title}</span>
                          <span className="text-slate-400"> · NIP {c.nip ?? '—'}</span>
                        </button>
                      </li>
                    ))}
                    {!searching && results.length === 0 && q.trim().length >= 2 && (
                      <li className="px-2 py-1 text-[11px] text-slate-400">Brak wyników</li>
                    )}
                  </ul>
                )}
              </div>
              <button
                onClick={reject}
                disabled={busy}
                className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Odrzuć
              </button>
            </div>
            <span className="text-[11px] text-slate-400">
              Wpisz nazwę firmy lub NIP i kliknij klienta z listy, aby zatwierdzić.
            </span>
            {err && <div className="text-[11px] text-red-600">{err}</div>}
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">
            {acc.client_id ? `→ ${acc.client_id.slice(0, 8)}…` : '—'}
          </span>
        )}
      </td>
    </tr>
  )
}

export function PortalAccountsTable({ rows }: { rows: PortalAccountRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Brak zgłoszeń portalu.</p>
  }
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b-2 border-[#DDD] text-left text-[11px] uppercase tracking-wider text-slate-500">
          <th className="py-2 pr-3">E-mail / data</th>
          <th className="py-2 pr-3">NIP</th>
          <th className="py-2 pr-3">Dopasowany klient</th>
          <th className="py-2 pr-3">Status</th>
          <th className="py-2">Akcja</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Row key={r.id} acc={r} />
        ))}
      </tbody>
    </table>
  )
}
