'use client'

// app/operacje/magazyn/page.tsx — Ф1
// Panel operatora: синхронізація товарів у Fakturownia + читання залишків.
// Дії викликають auth-захищені роути /api/fakturownia/*.

import { useState } from 'react'

type Warehouse = { id: number; name: string; kind?: string | null }

export default function MagazynPage() {
  const [busy, setBusy] = useState<string | null>(null)
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null)
  const [log, setLog] = useState<string>('')

  const push = (msg: string) =>
    setLog((prev) => `${new Date().toLocaleTimeString('pl-PL')}  ${msg}\n${prev}`)

  async function call(url: string, method: 'GET' | 'POST', label: string) {
    setBusy(label)
    try {
      const res = await fetch(url, { method })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        push(`❌ ${label}: ${data.error ?? res.status}`)
        return null
      }
      return data
    } catch (e: any) {
      push(`❌ ${label}: ${e?.message ?? 'błąd sieci'}`)
      return null
    } finally {
      setBusy(null)
    }
  }

  async function loadWarehouses() {
    const d = await call('/api/fakturownia/warehouses', 'GET', 'Magazyny')
    if (d) {
      setWarehouses(d.warehouses)
      push(`✅ Magazyny: ${d.warehouses.map((w: Warehouse) => `${w.name} (id ${w.id})`).join(', ') || 'brak'}`)
    }
  }

  async function syncStock() {
    const d = await call('/api/fakturownia/sync-stock', 'POST', 'Aktualizacja stanów')
    if (d) {
      const r = d.result
      push(
        `✅ Stany (magazyn ${r.warehouse}): dopasowano ${r.matched}, zaktualizowano ${r.updated}, pominięto ${r.skipped}`,
      )
    }
  }

  const btn =
    'px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition'

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-bold text-slate-900 mb-1">Magazyn · Fakturownia</h1>
      <p className="text-sm text-slate-500 mb-6">
        Синхронізація товарів і залишків зі складом Fakturownia (DAGOLD).
      </p>

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={loadWarehouses}
          disabled={busy !== null}
          className={`${btn} bg-slate-600 hover:bg-slate-700`}
        >
          {busy === 'Magazyny' ? '…' : 'Pobierz listę magazynów'}
        </button>
        <a
          href="/operacje/magazyn/import"
          className={`${btn} bg-[#1F3A5F] hover:bg-[#16293f] inline-flex items-center`}
        >
          Import faktury zakupowej →
        </a>
        <button
          onClick={syncStock}
          disabled={busy !== null}
          className={`${btn} bg-emerald-600 hover:bg-emerald-700`}
        >
          {busy === 'Aktualizacja stanów' ? '…' : 'Aktualizuj stany magazynowe'}
        </button>
      </div>

      {warehouses && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Magazyny</div>
          {warehouses.length === 0 ? (
            <div className="text-sm text-amber-700">
              Brak magazynów — sprawdź, czy moduł „Magazyn" jest aktywny w Fakturowni.
            </div>
          ) : (
            <ul className="text-sm text-slate-800 space-y-1">
              {warehouses.map((w) => (
                <li key={w.id}>
                  <span className="font-mono text-[#1F3A5F]">id {w.id}</span> — {w.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Log</div>
        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700 max-h-[400px] overflow-auto">
          {log || '—'}
        </pre>
      </div>
    </div>
  )
}
