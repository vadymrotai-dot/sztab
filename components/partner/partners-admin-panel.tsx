'use client'

// components/partner/partners-admin-panel.tsx — admin UI: nowy partner,
// konta logowania, przypisanie firm z paczki BGK_TESTOWA_PACZKA_100.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createPartner,
  createPartnerAccount,
  getPartnerLoginLink,
  assignAllUnassignedToPartner,
} from '@/app/actions/partner-admin'

export interface PartnerRow {
  id: string
  name: string
  slug: string
  notes: string | null
  active: boolean
  created_at: string
  companyCount: number
  accounts: { id: string; email: string; active: boolean }[]
}

function NewPartnerForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const res = await createPartner({ name, slug })
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setName('')
    setSlug('')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-[#E5E1D8] bg-white p-4">
      <label className="text-sm">
        <div className="text-xs uppercase text-slate-400">Nazwa partnera</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Credipass"
          required
          className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        <div className="text-xs uppercase text-slate-400">Slug</div>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="credipass"
          required
          className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-[#1F3A5F] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#16304f] disabled:opacity-50"
      >
        {busy ? 'Dodawanie…' : '+ Nowy partner'}
      </button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </form>
  )
}

function PartnerCard({ partner }: { partner: PartnerRow }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [batch, setBatch] = useState('BGK_TESTOWA_PACZKA_100')

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const res = await createPartnerAccount(partner.id, email)
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setLink(res.link)
    setEmail('')
    router.refresh()
  }

  const fetchLink = async (accountId: string) => {
    setBusy(true)
    setErr(null)
    const res = await getPartnerLoginLink(accountId)
    setBusy(false)
    if (!res.ok) setErr(res.error)
    else setLink(res.link)
  }

  const assignBatch = async () => {
    setBusy(true)
    setErr(null)
    const res = await assignAllUnassignedToPartner(partner.id, batch)
    setBusy(false)
    if (!res.ok) setErr(res.error)
    else router.refresh()
  }

  return (
    <div className="rounded-lg border border-[#E5E1D8] bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-800">{partner.name}</div>
          <div className="text-xs text-slate-400">
            /{partner.slug} · {partner.companyCount} przypisanych firm
          </div>
        </div>
        <Link
          href={`/partners/${partner.id}`}
          className="rounded-md border border-[#1F3A5F] px-3 py-1 text-xs font-medium text-[#1F3A5F] hover:bg-[#1F3A5F] hover:text-white"
        >
          Podgląd / edycja firm →
        </Link>
      </div>

      {partner.accounts.length > 0 && (
        <ul className="mb-3 space-y-1">
          {partner.accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-600">{a.email}</span>
              <button
                onClick={() => fetchLink(a.id)}
                className="text-[#1F3A5F] underline"
                disabled={busy}
              >
                Link logowania
              </button>
            </li>
          ))}
        </ul>
      )}

      {link && (
        <div className="mb-3 break-all rounded bg-slate-50 px-2 py-1 text-xs text-slate-700">
          {link}
        </div>
      )}

      <form onSubmit={addAccount} className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <div className="uppercase text-slate-400">Nowy e-mail konta</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="partner@firma.pl"
            required
            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-slate-700 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          + Konto
        </button>
      </form>

      <div className="flex flex-wrap items-end gap-2 border-t border-[#F0EDE4] pt-3">
        <label className="text-xs">
          <div className="uppercase text-slate-400">Paczka firm (source_batch)</div>
          <input
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </label>
        <button
          onClick={assignBatch}
          disabled={busy}
          className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          Przypisz całą paczkę
        </button>
      </div>

      {err && <div className="mt-2 text-xs text-red-700">{err}</div>}
    </div>
  )
}

export function PartnersAdminPanel({ partners }: { partners: PartnerRow[] }) {
  return (
    <div>
      <NewPartnerForm />
      <div className="space-y-4">
        {partners.map((p) => (
          <PartnerCard key={p.id} partner={p} />
        ))}
        {partners.length === 0 && (
          <div className="rounded-lg border border-[#E5E1D8] bg-white p-8 text-center text-sm text-slate-400">
            Brak partnerów. Dodaj pierwszego powyżej.
          </div>
        )}
      </div>
    </div>
  )
}
