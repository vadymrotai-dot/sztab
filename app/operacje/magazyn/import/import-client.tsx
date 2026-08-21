'use client'

// app/operacje/magazyn/import/import-client.tsx — Ф3.1
// Оператор: файл закупової → AI-розбір → екран перевірки → підтвердження → PZ.

import { useMemo, useState } from 'react'

type Supplier = { id: string; name: string }
type SupplierProduct = {
  id: string
  name: string
  unit: string | null
  vat_rate: number | null
  fakturownia_product_id: number | null
}
type Line = {
  external_name: string
  external_ean: string | null
  unit: string | null
  qty: number
  unit_price: number | null
  is_service: boolean
  action: 'match' | 'new' | 'skip'
  product_id: string | null
  new_name: string | null
  new_vat_rate: number
  suggested_product_id?: string | null
}

export function ImportClient({ suppliers }: { suppliers: Supplier[] }) {
  const [supplierId, setSupplierId] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [rate, setRate] = useState('4.30')
  const [fileB64, setFileB64] = useState('')
  const [mime, setMime] = useState('')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [invoice, setInvoice] = useState<{
    invoice_number: string | null
    invoice_date: string | null
    currency: string | null
  } | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [products, setProducts] = useState<SupplierProduct[]>([])
  const [result, setResult] = useState<any>(null)

  const rateNum = Number(rate.replace(',', '.')) || 1
  const isEur = currency.toUpperCase() === 'EUR'

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setMime(f.type)
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result || '')
      setFileB64(s.includes(',') ? s.split(',')[1] : s)
    }
    reader.readAsDataURL(f)
  }

  async function parse() {
    setErr('')
    setResult(null)
    if (!supplierId) return setErr('Wybierz dostawcę')
    if (!fileB64) return setErr('Wgraj plik faktury')
    setBusy('parse')
    try {
      const res = await fetch('/api/fakturownia/import/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: supplierId, file_base64: fileB64, mime_type: mime }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) return setErr(d.error || `Błąd ${res.status}`)
      setInvoice(d.invoice)
      if (d.invoice?.currency) setCurrency(d.invoice.currency)
      setProducts(d.supplier_products || [])
      setLines(
        (d.lines || []).map((l: any) => ({
          external_name: l.name,
          external_ean: l.ean ?? null,
          unit: l.unit ?? null,
          qty: Number(l.qty) || 0,
          unit_price: l.unit_price != null ? Number(l.unit_price) : null,
          is_service: !!l.is_service,
          suggested_product_id: l.suggested_product_id ?? null,
          action: l.is_service ? 'skip' : l.suggested_product_id ? 'match' : 'new',
          product_id: l.suggested_product_id ?? null,
          new_name: l.name,
          new_vat_rate: 0.05,
        })),
      )
    } catch (e: any) {
      setErr(e?.message || 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  function upd(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  const summary = useMemo(() => {
    let match = 0, create = 0, skip = 0
    for (const l of lines) {
      if (l.action === 'match') match++
      else if (l.action === 'new') create++
      else skip++
    }
    return { match, create, skip }
  }, [lines])

  async function commit() {
    setErr('')
    setBusy('commit')
    try {
      const res = await fetch('/api/fakturownia/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          invoice_number: invoice?.invoice_number ?? null,
          invoice_date: invoice?.invoice_date ?? null,
          currency,
          rate_to_pln: rateNum,
          lines: lines.map((l) => ({
            external_name: l.external_name,
            external_ean: l.external_ean,
            unit: l.unit,
            qty: l.qty,
            unit_price: l.unit_price,
            action: l.action,
            product_id: l.action === 'match' ? l.product_id : null,
            new_name: l.action === 'new' ? l.new_name : null,
            new_vat_rate: l.action === 'new' ? l.new_vat_rate : null,
          })),
        }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) return setErr(d.error || `Błąd ${res.status}`)
      setResult(d.result)
      setLines([])
    } catch (e: any) {
      setErr(e?.message || 'Błąd sieci')
    } finally {
      setBusy(null)
    }
  }

  const inp = 'px-2 py-1.5 border border-slate-300 rounded-md text-sm outline-none focus:border-[#1F3A5F]'

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-xl font-bold text-slate-900 mb-1">Import faktury zakupowej → magazyn</h1>
      <p className="text-sm text-slate-500 mb-5">
        Wgraj fakturę (zdjęcie / PDF), sprawdź pozycje, zatwierdź. PZ doda stany w Fakturowni.
        Cena sprzedaży się NIE zmienia.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <label className="flex flex-col text-xs text-slate-500 gap-1">
          Dostawca
          <select className={inp} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— wybierz —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-500 gap-1">
          Waluta
          <select className={inp} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="EUR">EUR</option>
            <option value="PLN">PLN</option>
          </select>
        </label>
        {isEur && (
          <label className="flex flex-col text-xs text-slate-500 gap-1">
            Kurs EUR→PLN
            <input className={`${inp} w-24`} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
          </label>
        )}
        <label className="flex flex-col text-xs text-slate-500 gap-1">
          Plik faktury
          <input type="file" accept="image/*,application/pdf" onChange={onFile} className="text-sm" />
        </label>
        <button
          onClick={parse}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#1F3A5F] hover:bg-[#16293f] disabled:opacity-40"
        >
          {busy === 'parse' ? 'Rozpoznaję…' : 'Rozpoznaj fakturę'}
        </button>
      </div>

      {err && <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{err}</div>}

      {result && (
        <div className="mb-4 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-3">
          ✅ Import zapisany. PZ nr {result.pz_number || '—'} (id {result.pz_id ?? '—'}). Utworzono {result.created_products}, dopasowano {result.matched_products}, pominięto {result.skipped}.
          {result.errors?.length ? <div className="mt-1 text-red-700">Błędy: {result.errors.join('; ')}</div> : null}
        </div>
      )}

      {lines.length > 0 && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            Faktura {invoice?.invoice_number || '—'} · {invoice?.invoice_date || '—'} · dopasować {summary.match}, nowe {summary.create}, pominąć {summary.skip}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">Pozycja z faktury</th>
                  <th className="text-right px-2 py-2">Ilość</th>
                  <th className="text-right px-2 py-2">Cena {currency}</th>
                  <th className="text-right px-2 py-2">Koszt PLN</th>
                  <th className="text-left px-2 py-2">Akcja</th>
                  <th className="text-left px-2 py-2 min-w-[220px]">Towar Sztab</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const costPln = l.unit_price != null ? Math.round(l.unit_price * rateNum * 100) / 100 : null
                  return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{l.external_name}</div>
                        {l.external_ean && <div className="text-[11px] text-slate-400">EAN {l.external_ean}</div>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input className={`${inp} w-20 text-right`} value={l.qty}
                          onChange={(e) => upd(i, { qty: Number(e.target.value.replace(',', '.')) || 0 })} inputMode="decimal" />
                        <span className="text-[11px] text-slate-400 ml-1">{l.unit}</span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input className={`${inp} w-20 text-right`} value={l.unit_price ?? ''}
                          onChange={(e) => upd(i, { unit_price: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) || 0 })} inputMode="decimal" />
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-[#1F3A5F]">{costPln ?? '—'}</td>
                      <td className="px-2 py-2">
                        <select className={inp} value={l.action} onChange={(e) => upd(i, { action: e.target.value as Line['action'] })}>
                          <option value="match">Dopasuj</option>
                          <option value="new">Nowy</option>
                          <option value="skip">Pomiń</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        {l.action === 'match' && (
                          <select className={`${inp} w-full`} value={l.product_id ?? ''} onChange={(e) => upd(i, { product_id: e.target.value || null })}>
                            <option value="">— wybierz towar —</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        )}
                        {l.action === 'new' && (
                          <div className="flex gap-1">
                            <input className={`${inp} flex-1`} value={l.new_name ?? ''} onChange={(e) => upd(i, { new_name: e.target.value })} placeholder="Nazwa nowego towaru" />
                            <select className={inp} value={l.new_vat_rate} onChange={(e) => upd(i, { new_vat_rate: Number(e.target.value) })}>
                              <option value={0.05}>5%</option>
                              <option value={0.23}>23%</option>
                            </select>
                          </div>
                        )}
                        {l.action === 'skip' && <span className="text-[12px] text-slate-400 italic">— pomijane —</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button onClick={commit} disabled={busy !== null}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40">
              {busy === 'commit' ? 'Zapisuję…' : 'Zatwierdź import (utwórz PZ)'}
            </button>
            <span className="text-xs text-slate-400">Cena sprzedaży pozostaje bez zmian — ustawia ją operator osobno.</span>
          </div>
        </>
      )}
    </div>
  )
}
