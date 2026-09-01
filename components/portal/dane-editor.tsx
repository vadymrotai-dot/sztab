'use client'

// components/portal/dane-editor.tsx — Portal klienta Faza 1: edycja "Moje dane".
// Zapis WYŁĄCZNIE przez scoped server actions. Segment/pricing nieobecne.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  portalUpsertContact,
  portalDeleteContact,
  portalUpsertDeliveryPoint,
  portalDeactivateDeliveryPoint,
  portalSetMarketingConsent,
} from '@/app/portal/data-actions'

interface Contact {
  id: string
  kind: string
  value: string
  label: string | null
  is_primary: boolean
}
interface Point {
  id: string
  nazwa: string
  ulica: string | null
  kod_pocztowy: string | null
  miasto: string | null
  odbiorca_imie: string | null
  odbiorca_telefon: string | null
  typ_punktu: string | null
}

export function DaneEditor({
  firma,
  marketingConsent,
  contacts,
  points,
}: {
  firma: { title: string; nip: string; city: string; address: string }
  marketingConsent: boolean
  contacts: Contact[]
  points: Point[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setErr(null)
      const r = await fn()
      if (!r.ok) setErr(r.error ?? 'Błąd zapisu')
      else router.refresh()
    })

  // add-contact form
  const [ncKind, setNcKind] = useState<'email' | 'phone'>('email')
  const [ncVal, setNcVal] = useState('')
  // add/edit-point form
  const [pForm, setPForm] = useState<Partial<Point> | null>(null)

  // Bezpieczeństwo — hasło (updateUser z aktywnej sesji, min 8 w UI)
  const [pwd1, setPwd1] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [pwdBusy, setPwdBusy] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<string | null>(null)
  const [pwdErr, setPwdErr] = useState<string | null>(null)

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdErr(null)
    setPwdMsg(null)
    if (pwd1.length < 8) {
      setPwdErr('Hasło musi mieć co najmniej 8 znaków')
      return
    }
    if (pwd1 !== pwd2) {
      setPwdErr('Hasła nie są takie same')
      return
    }
    setPwdBusy(true)
    const { error } = await createClient().auth.updateUser({ password: pwd1 })
    setPwdBusy(false)
    if (error) {
      setPwdErr(error.message)
      return
    }
    setPwd1('')
    setPwd2('')
    setPwdMsg('Hasło zapisane. Następnym razem możesz zalogować się hasłem.')
  }

  return (
    <div className="space-y-6">
      {err && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      {/* Firma — read-only */}
      <section className="rounded-lg border border-[#E5E1D8] bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Firma</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-slate-400">Nazwa:</span> {firma.title}</div>
          <div><span className="text-slate-400">NIP:</span> {firma.nip || '—'}</div>
          <div className="col-span-2">
            <span className="text-slate-400">Adres rejestrowy:</span>{' '}
            {[firma.address, firma.city].filter(Boolean).join(', ') || '—'}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Dane rejestrowe — tylko do odczytu. Zmiany zgłoś opiekunowi.
        </p>
      </section>

      {/* Zgoda marketingowa (RODO) */}
      <section className="rounded-lg border border-[#E5E1D8] bg-white p-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={marketingConsent}
            disabled={pending}
            onChange={(e) => run(() => portalSetMarketingConsent(e.target.checked))}
            className="h-4 w-4 accent-[#1F3A5F]"
          />
          <span className="font-medium text-slate-700">
            Zgoda na kontakt marketingowy (oferty, nowości)
          </span>
        </label>
      </section>

      {/* Kontakty */}
      <section className="rounded-lg border border-[#E5E1D8] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Dane kontaktowe</h2>
        <ul className="mb-3 space-y-1 text-sm">
          {contacts.length === 0 && <li className="text-slate-400">Brak kontaktów.</li>}
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="w-14 text-[11px] uppercase text-slate-400">{c.kind}</span>
              <span className="flex-1">{c.value}</span>
              <button
                disabled={pending || c.is_primary}
                onClick={() =>
                  run(() =>
                    portalUpsertContact({
                      id: c.id,
                      kind: c.kind as 'email' | 'phone',
                      value: c.value,
                      label: c.label,
                      is_primary: true,
                    }),
                  )
                }
                className={`text-xs ${c.is_primary ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`}
                title={c.is_primary ? 'Główny' : 'Ustaw jako główny'}
              >
                ★
              </button>
              <button
                disabled={pending}
                onClick={() => run(() => portalDeleteContact(c.id))}
                className="text-xs text-slate-400 hover:text-red-600"
              >
                Usuń
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <select
            value={ncKind}
            onChange={(e) => setNcKind(e.target.value as 'email' | 'phone')}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="email">E-mail</option>
            <option value="phone">Telefon</option>
          </select>
          <input
            value={ncVal}
            onChange={(e) => setNcVal(e.target.value)}
            placeholder={ncKind === 'email' ? 'kontakt@firma.pl' : '+48…'}
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            disabled={pending || !ncVal}
            onClick={() =>
              run(async () => {
                const r = await portalUpsertContact({ kind: ncKind, value: ncVal })
                if (r.ok) setNcVal('')
                return r
              })
            }
            className="rounded bg-[#1F3A5F] px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            Dodaj
          </button>
        </div>
      </section>

      {/* Punkty dostawy */}
      <section className="rounded-lg border border-[#E5E1D8] bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Punkty dostawy</h2>
          <button
            onClick={() => setPForm({ nazwa: '', typ_punktu: 'sklep' })}
            className="rounded border border-[#E5E1D8] px-2 py-1 text-xs hover:bg-slate-50"
          >
            + Dodaj punkt
          </button>
        </div>
        <ul className="mb-3 space-y-2 text-sm">
          {points.length === 0 && <li className="text-slate-400">Brak punktów.</li>}
          {points.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-2 border-b border-[#F0F0F0] pb-2">
              <div>
                <div className="font-medium text-slate-700">{p.nazwa}</div>
                <div className="text-[12px] text-slate-500">
                  {[p.ulica, p.kod_pocztowy, p.miasto].filter(Boolean).join(', ') || '—'}
                  {p.odbiorca_imie ? ` · ${p.odbiorca_imie}` : ''}
                  {p.odbiorca_telefon ? ` · ${p.odbiorca_telefon}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  disabled={pending}
                  onClick={() => setPForm(p)}
                  className="text-xs text-slate-500 hover:text-indigo-600"
                >
                  Edytuj
                </button>
                <button
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Usunąć punkt "${p.nazwa}"?`))
                      run(() => portalDeactivateDeliveryPoint(p.id))
                  }}
                  className="text-xs text-slate-500 hover:text-red-600"
                >
                  Usuń
                </button>
              </div>
            </li>
          ))}
        </ul>

        {pForm && (
          <div className="space-y-2 rounded-md bg-[#FAFAF7] p-3">
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Nazwa punktu *" value={pForm.nazwa ?? ''}
                onChange={(e) => setPForm({ ...pForm, nazwa: e.target.value })}
                className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm" />
              <input placeholder="Ulica i numer" value={pForm.ulica ?? ''}
                onChange={(e) => setPForm({ ...pForm, ulica: e.target.value })}
                className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm" />
              <input placeholder="Kod pocztowy" value={pForm.kod_pocztowy ?? ''}
                onChange={(e) => setPForm({ ...pForm, kod_pocztowy: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 text-sm" />
              <input placeholder="Miasto" value={pForm.miasto ?? ''}
                onChange={(e) => setPForm({ ...pForm, miasto: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 text-sm" />
              <input placeholder="Osoba kontaktowa" value={pForm.odbiorca_imie ?? ''}
                onChange={(e) => setPForm({ ...pForm, odbiorca_imie: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 text-sm" />
              <input placeholder="Telefon" value={pForm.odbiorca_telefon ?? ''}
                onChange={(e) => setPForm({ ...pForm, odbiorca_telefon: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
            <div className="flex gap-2">
              <button
                disabled={pending || !pForm.nazwa}
                onClick={() =>
                  run(async () => {
                    const r = await portalUpsertDeliveryPoint({
                      id: pForm.id,
                      nazwa: pForm.nazwa ?? '',
                      ulica: pForm.ulica ?? null,
                      kod_pocztowy: pForm.kod_pocztowy ?? null,
                      miasto: pForm.miasto ?? null,
                      odbiorca_imie: pForm.odbiorca_imie ?? null,
                      odbiorca_telefon: pForm.odbiorca_telefon ?? null,
                      typ_punktu: pForm.typ_punktu ?? 'sklep',
                    })
                    if (r.ok) setPForm(null)
                    return r
                  })
                }
                className="rounded bg-[#1F3A5F] px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                Zapisz
              </button>
              <button
                onClick={() => setPForm(null)}
                className="rounded border border-slate-300 px-3 py-1 text-sm"
              >
                Anuluj
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[#E5E1D8] bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Bezpieczeństwo — hasło logowania</h2>
        <p className="mb-3 text-[12px] text-slate-500">
          Ustaw hasło, aby logować się bez czekania na link e-mail. Link e-mail
          pozostaje dostępny (także gdy zapomnisz hasła).
        </p>
        <form onSubmit={savePassword} className="flex flex-wrap items-end gap-2">
          <input
            type="password"
            value={pwd1}
            onChange={(e) => setPwd1(e.target.value)}
            placeholder="Nowe hasło (min. 8)"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            type="password"
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            placeholder="Powtórz hasło"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={pwdBusy || !pwd1 || !pwd2}
            className="rounded px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: '#1F3A5F' }}
          >
            {pwdBusy ? 'Zapisuję…' : 'Zapisz hasło'}
          </button>
        </form>
        {pwdErr && <div className="mt-2 text-[12px] text-red-600">{pwdErr}</div>}
        {pwdMsg && <div className="mt-2 text-[12px] text-green-700">{pwdMsg}</div>}
      </section>
    </div>
  )
}
