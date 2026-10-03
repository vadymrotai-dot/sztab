// app/partner-portal/page.tsx — Portal partnera: lista przypisanych firm.
// RLS robi izolację (bgk_companies_partner_select /
// partner_company_links_partner_select przez current_portal_partner_id()) —
// ten query przez sesyjny klient (nie admin) zwróci TYLKO firmy tego partnera,
// nawet gdyby kod miał błąd.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPartnerUser, getPartnerAccount } from '@/lib/partner/session'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, string> = {
  new: 'Nowa',
  in_progress: 'W trakcie',
  contacted: 'Skontaktowano',
  qualified: 'Zakwalifikowana',
  rejected: 'Odrzucona',
  converted: 'Zamknięta (deal)',
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-50 text-blue-700',
  contacted: 'bg-amber-50 text-amber-700',
  qualified: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
  converted: 'bg-purple-50 text-purple-700',
}

export default async function PartnerPortalIndex() {
  const user = await getPartnerUser()
  if (!user) redirect('/partner-portal/login')
  const acc = await getPartnerAccount(user.id)
  if (!acc) redirect('/partner-portal/login')

  const supabase = await createClient()
  const { data: links } = await supabase
    .from('partner_company_links')
    .select(
      'status, notes, shared_at, company:bgk_companies(id, nip, name, krs, legal_form, address, pkd_main)',
    )
    .order('shared_at', { ascending: false })

  type Row = {
    status: string
    notes: string | null
    shared_at: string
    company: {
      id: string
      nip: string
      name: string
      krs: string | null
      legal_form: string | null
      address: string | null
      pkd_main: string | null
    } | null
  }
  const rows = (links ?? []) as unknown as Row[]

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-800">Firmy przekazane do weryfikacji</h1>
        <p className="text-sm text-slate-500">
          Łącznie: <b>{rows.length}</b>
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#E5E1D8] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[#E5E1D8] bg-[#F7F5F0] text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Firma</th>
              <th className="px-4 py-2">NIP</th>
              <th className="px-4 py-2">Forma prawna</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              r.company ? (
                <tr key={r.company.id} className="border-b border-[#F0EDE4] last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-800">{r.company.name}</td>
                  <td className="px-4 py-2 text-slate-600">{r.company.nip}</td>
                  <td className="px-4 py-2 text-slate-600">{r.company.legal_form ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-slate-100 text-slate-700'}`}
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/partner-portal/${r.company.id}`}
                      className="text-xs font-medium text-[#1F3A5F] underline"
                    >
                      Profil firmy →
                    </Link>
                  </td>
                </tr>
              ) : null,
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  Brak przekazanych firm.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
