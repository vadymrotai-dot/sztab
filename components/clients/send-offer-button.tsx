// components/clients/send-offer-button.tsx
// Sprint S-OFFER.1 (21.05.2026) — sales outreach button з editable message + xlsx cennik.
//
// Flow:
//  1. Vadym clicks "Wyślij ofertę" → modal opens з default email + pre-filled message
//  2. Edits text (placeholder <<order_link>> stays — replaced server-side)
//  3. POST /api/clients/[id]/send-offer → creates draft order + sends email
//  4. Server replaces <<order_link>> з real /zamowienie/<token> URL
//
// Disabled state якщо client має пустий email — потрібно додати у profile спочатку.

'use client'

import { useState, useEffect } from 'react'
import { Mail, Send, X, Check, AlertCircle } from 'lucide-react'

type Cohort = { id: string; name: string }

type Props = {
  clientId: string
  clientTitle: string
  clientEmail: string | null
  cohorts?: Cohort[]
}

function buildDefaultMessage(lang: 'pl' | 'ua') {
  if (lang === 'ua') {
    return `Доброго дня,

Надсилаю актуальну гуртову оферту DAGOLD — квашені й салати (Czudowa Marka), риба та морепродукти (AVIS-D, Латвія), кальмари й сушені снеки.

Повний асортимент, ціни нетто та знижки будуть у формі замовлення — натисніть кнопку нижче.

Щоб оформити замовлення онлайн — натисніть велику кнопку «ЗАМОВИТИ ТУТ» нижче. Форма займає 2 хвилини, знижка рахується автоматично в міру набору товару.

За питаннями — телефонуйте або пишіть.

З повагою,
Менеджер із замовлень · DAGOLD
+48 510 924 301
vasin@dagold.com`
  }
  return `Dzień dobry,

Przesyłam aktualną ofertę hurtową DAGOLD — kiszonki i surówki (Czudowa Marka), ryby i owoce morza (AVIS-D, Łotwa) oraz kalmary i przekąski suszone.

Pełny asortyment, ceny netto i rabaty będą w formularzu zamówienia — kliknij przycisk poniżej.

Aby złożyć zamówienie online — kliknij duży przycisk „ZAMÓW TUTAJ" poniżej. Formularz zajmuje 2 minuty, rabat nalicza się automatycznie w miarę dodawania towaru.

W razie pytań proszę o telefon lub maila.

Pozdrawiam,
Menedżer ds. zamówień · DAGOLD
+48 510 924 301
vasin@dagold.com`
}

export function SendOfferButton({
  clientId,
  clientTitle,
  clientEmail,
  cohorts,
}: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(clientEmail || '')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{
    ok: boolean
    error?: string
    orderLink?: string
  } | null>(null)
  const [cohortId, setCohortId] = useState<string>('')
  // Krok DAGOLD — język oferty (PL/UA): steruje załącznikiem i językiem maila.
  const [offerLang, setOfferLang] = useState<'pl' | 'ua'>('pl')

  useEffect(() => {
    if (open) {
      setEmail(clientEmail || '')
      setMessage(buildDefaultMessage(offerLang))
      setResult(null)
    }
  }, [open, clientEmail, offerLang])

  const hasEmail = Boolean(clientEmail)

  const handleSend = async () => {
    setSending(true)
    setResult(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/send-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          message,
          create_order_link: true,
          cohort_id: cohortId || null,
          // Krok DAGOLD — język oferty (załącznik + treść maila PL/UA).
          offer_lang: offerLang,
        }),
      })
      const data = await res.json()
      setResult({
        ok: data.ok,
        error: data.error,
        orderLink: data.order_link,
      })
      if (data.ok) {
        setTimeout(() => {
          setOpen(false)
          setResult(null)
        }, 3000)
      }
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || 'Network error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!hasEmail}
        title={
          hasEmail
            ? 'Wyślij ofertę z cennikiem'
            : 'Brak email klienta — dodaj do profilu'
        }
        className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Mail className="h-4 w-4" />
        Wyślij ofertę
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !sending && setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">
                Wyślij ofertę — {clientTitle}
              </h3>
              <button
                onClick={() => setOpen(false)}
                disabled={sending}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Adres email odbiorcy
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  placeholder="kontakt@firma.pl"
                />
              </div>

              {cohorts && cohorts.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Cohort dla zamówienia (opcjonalnie)
                  </label>
                  <select
                    value={cohortId}
                    onChange={(e) => setCohortId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">— brak —</option>
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Krok DAGOLD — język oferty (załącznik DAGOLD PL/UA + treść maila) */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Język oferty
                </label>
                <div className="flex gap-3">
                  <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="radio"
                      name="offer_lang"
                      value="pl"
                      checked={offerLang === 'pl'}
                      onChange={() => setOfferLang('pl')}
                      className="accent-amber-600"
                    />
                    <span>
                      <strong>Polski</strong> — oferta PL
                    </span>
                  </label>
                  <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="radio"
                      name="offer_lang"
                      value="ua"
                      checked={offerLang === 'ua'}
                      onChange={() => setOfferLang('ua')}
                      className="accent-amber-600"
                    />
                    <span>
                      <strong>Українська</strong> — oferta UA
                    </span>
                  </label>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Zmienia załącznik i język wiadomości. Ceny liczą się automatycznie
                  przez rabaty wolumenowe w formularzu.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Treść wiadomości
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={14}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs focus:border-amber-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Placeholder <code>&lt;&lt;order_link&gt;&gt;</code> zostanie
                  zastąpiony wygenerowanym linkiem
                </p>
              </div>


              {result && (
                <div
                  className={`rounded-md p-3 text-sm ${
                    result.ok
                      ? 'bg-emerald-50 text-emerald-900'
                      : 'bg-rose-50 text-rose-900'
                  }`}
                >
                  {result.ok ? (
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      <span>Wysłano pomyślnie!</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      <span>Błąd: {result.error}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  onClick={() => setOpen(false)}
                  disabled={sending}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Anuluj
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || !email || !message}
                  className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {sending ? (
                    <span>Wysyłanie...</span>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Wyślij
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
