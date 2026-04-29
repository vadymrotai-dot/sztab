// app/api/clients/[id]/export-markdown/route.ts
// Sprint P FIX 5 — markdown export of client profile.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 })

  const [{ data: client }, { data: people }, { data: tenders }, { data: matches }, { data: openers }] =
    await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase
        .from('person_company_links')
        .select('rola, jest_decyzyjny, persons(imie, nazwisko, email_glowny, telefon_komorkowy)')
        .eq('client_id', id),
      supabase
        .from('bzp_tenders')
        .select('subject, ordering_party, award_date')
        .eq('client_id', id)
        .order('award_date', { ascending: false })
        .limit(5),
      supabase
        .from('matches')
        .select('combined_score, products(name, taxonomy_families(name_pl))')
        .eq('client_id', id)
        .order('combined_score', { ascending: false })
        .limit(5),
      supabase
        .from('cohort_cold_openers')
        .select('opener_text, generated_at')
        .eq('client_id', id)
        .order('generated_at', { ascending: false })
        .limit(1),
    ])

  if (!client) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  const c = client as {
    title: string
    nip: string | null
    krs_legal_form: string | null
    city: string | null
    region: string | null
    address: string | null
    phone: string | null
    email: string | null
    website: string | null
    business_profile: {
      business_format?: string
      business_summary_pl?: string
      buyer_strength_for_chm?: number
      buyer_reasoning_pl?: string
    } | null
  }

  const out: string[] = []
  out.push(`# ${c.title}`)
  out.push('')
  if (c.nip) out.push(`**NIP:** ${c.nip}`)
  if (c.krs_legal_form) out.push(`**Forma prawna:** ${c.krs_legal_form}`)
  if (c.address || c.city || c.region) {
    out.push(`**Adres:** ${[c.address, c.city, c.region].filter(Boolean).join(', ')}`)
  }
  out.push('')

  if (c.phone || c.email || c.website) {
    out.push('## Kontakt')
    if (c.phone) out.push(`- 📞 ${c.phone}`)
    if (c.email) out.push(`- ✉️ ${c.email}`)
    if (c.website) out.push(`- 🌐 ${c.website}`)
    out.push('')
  }

  if (c.business_profile?.business_format) {
    out.push('## Analiza biznesowa (AI)')
    out.push(`- **Format:** ${c.business_profile.business_format}`)
    if (c.business_profile.business_summary_pl) {
      out.push(`- ${c.business_profile.business_summary_pl}`)
    }
    if (c.business_profile.buyer_strength_for_chm !== undefined) {
      out.push(`- **Buyer strength dla ChM:** ${c.business_profile.buyer_strength_for_chm}/100`)
      if (c.business_profile.buyer_reasoning_pl) {
        out.push(`  > ${c.business_profile.buyer_reasoning_pl}`)
      }
    }
    out.push('')
  }

  const peopleRows = ((people ?? []) as unknown) as Array<{
    rola: string
    jest_decyzyjny: boolean
    persons:
      | { imie: string; nazwisko: string; email_glowny: string | null; telefon_komorkowy: string | null }
      | { imie: string; nazwisko: string; email_glowny: string | null; telefon_komorkowy: string | null }[]
      | null
  }>
  if (peopleRows.length > 0) {
    out.push('## Osoby decyzyjne')
    for (const link of peopleRows) {
      const p = Array.isArray(link.persons) ? link.persons[0] : link.persons
      if (!p) continue
      out.push(
        `- **${p.imie} ${p.nazwisko}** — ${link.rola}${link.jest_decyzyjny ? ' ⭐' : ''}`,
      )
      if (p.email_glowny) out.push(`  - ✉️ ${p.email_glowny}`)
      if (p.telefon_komorkowy) out.push(`  - 📞 ${p.telefon_komorkowy}`)
    }
    out.push('')
  }

  const tendersRows = (tenders ?? []) as Array<{
    subject: string | null
    ordering_party: string | null
    award_date: string | null
  }>
  if (tendersRows.length > 0) {
    out.push('## Przetargi BZP')
    for (const t of tendersRows) {
      out.push(`- ${t.award_date ?? '?'}: ${t.subject ?? '—'} (${t.ordering_party ?? '?'})`)
    }
    out.push('')
  }

  const matchRows = ((matches ?? []) as unknown) as Array<{
    combined_score: number
    products: {
      name: string
      taxonomy_families: { name_pl: string } | { name_pl: string }[] | null
    } | null
  }>
  if (matchRows.length > 0) {
    out.push('## Top dopasowania Sztab')
    for (const m of matchRows) {
      const tf = m.products?.taxonomy_families
      const fam = Array.isArray(tf) ? tf[0]?.name_pl : tf?.name_pl
      out.push(`- **${m.combined_score}/100** — ${m.products?.name ?? '?'} (${fam ?? '?'})`)
    }
    out.push('')
  }

  const openerRow = ((openers ?? []) as Array<{ opener_text: string }>)?.[0]
  if (openerRow?.opener_text) {
    out.push('## Cold opener (AI)')
    out.push(`> ${openerRow.opener_text}`)
    out.push('')
  }

  const md = out.join('\n')
  const filename = `client-${c.nip ?? id}-${new Date().toISOString().slice(0, 10)}.md`
  return new NextResponse(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
