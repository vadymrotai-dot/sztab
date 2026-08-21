'use client'

// app/operacje/magazyn/wydanie/wydanie-client.tsx — Ф2
// Ręczne wydanie magazynowe: WZ (z klientem) lub RW (bez klienta — korekta).

import { useMemo, useState } from 'react'

type P = { id: string; name: string; unit: string | null; stock_level: number | null }

export function WydanieClient({ products }: { products: P[] }) {
  const [clientName, setClientName] = useState('')
  const [clientNip, setClientNip] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [description, setDescription] = useState('')
  const [qty, setQty] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<any>(null)

  const inp =
    'px-2 py-1.5 border border-slate-300 rounded-md text-sm outline-none focus:border-[#1F3A5F]'

  const lines = useMemo(
    () =>
      products
        .map((p) => ({ product_id: p.id, qty: Number((qty[p.id] || '').replace(',', '.')) || 0 }))
        .filter((l) => l.qty > 0),
    [qty, products],
  )

  async function submit() {
    setErr('')
    setResult(null)
    if (lines.length === 0) return setErr('Wpisz ilość przynajmniej jednej pozycji')
    setBusy(true)
    try {
      const res = await fetch('/api/fakturownia/warehouse-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName || null,
          client_nip: clientNip || null,
          issue_date: issueDate || null,
          description: description || null,
          lines,
        }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) return setErr(d.error || `Błąd ${res.status}`)
      setResult(d.result)
      setQty({})
    } catch (e: any) {
      setErr(e?.message || 'Błąd sieci')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-bold text-slate-900 mb-1">Wydanie magazynowe (WZ / RW)</h1>
      <p className="text-sm text-slate-500 mb-5">
        Ręczne zdjęcie stanu. Z klientem → WZ (sprzedaż). Bez klienta → RW (korekta/inwentaryzacja).
      </p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <label className="flex flex-col text-xs text-slate-500 gap-1">
          Odbiorca (klient) — puste = RW
          <input className={inp} value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="np. WIXMART Sp. z o.o." />
        </label>
        <label className="flex flex-col text-xs text-slate-500 gap-1">
          NIP odbiorcy
          <input className={inp} value={clientNip} onChange={(e) => setClientNip(e.target.value)} placeholder="np. 5213984715" />
        </label>
        <label className="flex flex-col text-xs text-slate-500 gap-1">
          Data
          <input className={inp} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </label>
        <label className="flex flex-col text-xs text-slate-500 gap-1">
          Opis / powód
          <input className={inp} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="np. WZ do faktury 1/08/2026" />
        </label>
      </div>

      {err && <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{err}</div>}
      {result && (
        <div className="mb-4 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-3">
          ✅ Utworzono {result.kind?.toUpperCase()} nr {result.number || '—'} (id {result.id}). Stan zaktualizowany dla {result.updated} poz.
          {result.errors?.length ? <div className="mt-1 text-red-700">{result.errors.join('; ')}</div> : null}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Towar</th>
              <th className="text-right px-2 py-2">Stan</th>
              <th className="text-right px-2 py-2">Wydać</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-800">{p.name}</td>
                <td className="px-2 py-2 text-right text-slate-500">
                  {p.stock_level ?? '—'} {p.unit}
                </td>
                <td className="px-2 py-2 text-right">
                  <input
                    className={`${inp} w-24 text-right`}
                    value={qty[p.id] ?? ''}
                    onChange={(e) => setQty((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-slate-400 text-sm">
                  Brak towarów magazynowych. Najpierw zaimportuj fakturę zakupową.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <button
          onClick={submit}
          disabled={busy}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#1F3A5F] hover:bg-[#16293f] disabled:opacity-40"
        >
          {busy ? 'Tworzę…' : 'Utwórz wydanie'}
        </button>
      </div>
    </div>
  )
}
