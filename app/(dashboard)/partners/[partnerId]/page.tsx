// app/(dashboard)/partners/[partnerId]/page.tsx — admin: podgląd TEGO, co
// widzi dany partner (lista przypisanych firm), bez logowania się na jego
// konto. Zapytanie przez admin client, filtrowane explicit po partnerId —
// to NIE jest impersonacja sesji, więc zero ryzyka dla własnej sesji staff.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

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

const TIER_COLORS: Record<string, string> = {
  'Tier 1 - najcieplejszy': 'bg-orange-50 text-orange-700',
  'Tier 2': 'bg-slate-100 text-slate-600',
}

function formatPln(v: number | null) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(v) + ' zł'
}

export default async function AdminPartnerView({
  params,
}: {
  params: Promise<{ partnerId: string }>
}) {
  const { partnerId } = await params
  const admin = createAdminClient()

  const { data: partner } = await admin
    .from('partners')
    .select('id, name, slug')
    .eq('id', partnerId)
    .maybeSingle()
  if (!partner) notFound()

  const { data: links } = await admin
    .from('partner_company_links')
    .select(
      'status, notes, shared_at, company:bgk_companies(id, nip, name, legal_form, tier, amount_gross_pln, phone, decision_person)',
    )
    .eq('partner_id', partnerId)
    .order('shared_at', { ascending: false })

  type Row = {
    status: string
    notes: string | null
    shared_at: string
    company: {
      id: string
      nip: string
      name: string
      legal_form: string | null
      tier: string | null
      amount_gross_pln: number | null
      phone: string | null
      decision_person: string | null
    } | null
  }
  const rows = (links ?? []) as unknown as Row[]

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4">
        <Link href="/partners" className="text-xs text-[#1F3A5F] underline">
          ← Partnerzy
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-800">
          Podgląd jako: {partner.name}
        </h1>
        <p className="text-sm text-slate-500">
          To, co widzi (i może edytować) partner /{partner.slug} w swoim portalu. Łącznie:{' '}
          <b>{rows.length}</b> firm.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#E5E1D8] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[#E5E1D8] bg-[#F7F5F0] text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Firma</th>
              <th className="px-4 py-2">NIP</th>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2">Kwota poręczenia</th>
              <th className="px-4 py-2">Kontakt</th>
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
                  <td className="px-4 py-2">
                    {r.company.tier && (
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${TIER_COLORS[r.company.tier] ?? 'bg-slate-100 text-slate-600'}`}
                      >
                        {r.company.tier}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{formatPln(r.company.amount_gross_pln)}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.company.decision_person && (
                      <div className="text-xs">{r.company.decision_person}</div>
                    )}
                    {r.company.phone && <div className="text-xs text-slate-400">{r.company.phone}</div>}
                    {!r.company.decision_person && !r.company.phone && '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-slate-100 text-slate-700'}`}
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/partners/${partnerId}/${r.company.id}`}
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
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
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
