// app/api/lookup/dispatcher/route.ts
// Sprint O Phase 6 — multi-input search dispatcher для AddCompanyModal.
//
// Dispatch logic:
//   NIP/REGON/KRS → DB лookup (existing client/prospect) → if not found,
//                   call GUS REGON via enrichWithGUS to get fresh data →
//                   return single candidate
//   email/phone/url → DB ILIKE search across clients + ceidg_prospects
//   name_text → DB ILIKE search across clients.title + ceidg_prospects.name
//
// "Adopt" endpoint (separate /adopt route) creates clients row + triggers
// /api/intelligence/lookup для full enrichment.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectInputType, normalizeNip, normalizePhone, extractDomain } from '@/lib/lookup/dispatcher'
import { enrichWithGUS, gusLogin } from '@/lib/enrichment/gus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface Candidate {
  source: string
  name: string
  nip: string | null
  city: string | null
  legal_form: string | null
  payload: {
    type: 'existing_client' | 'existing_prospect' | 'gus_fresh' | 'manual'
    id?: string
    nip?: string
    raw?: unknown
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 })

  let body: { input?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }
  const input = (body.input ?? '').trim()
  if (!input) return NextResponse.json({ ok: false, error: 'input required' }, { status: 400 })

  const type = detectInputType(input)
  const candidates: Candidate[] = []

  // 1. NIP/REGON/KRS — lookup в DB по NIP first
  if (type === 'nip' || type === 'regon' || type === 'krs') {
    const cleanNip = normalizeNip(input)

    // Existing client?
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id, title, nip, city, krs_legal_form')
      .eq('nip', cleanNip)
      .maybeSingle()
    if (existingClient) {
      const e = existingClient as {
        id: string
        title: string
        nip: string
        city: string | null
        krs_legal_form: string | null
      }
      // Existing → redirect direct
      return NextResponse.json({
        ok: true,
        type,
        message: 'Klient już istnieje',
        redirect: `/clients/${e.id}`,
      })
    }

    // Existing prospect?
    const { data: existingProspect } = await supabase
      .from('ceidg_prospects')
      .select('id, name, nip, miejscowosc, krs_legal_form')
      .eq('nip', cleanNip)
      .maybeSingle()
    if (existingProspect) {
      const p = existingProspect as {
        id: string
        name: string
        nip: string
        miejscowosc: string | null
        krs_legal_form: string | null
      }
      candidates.push({
        source: 'CEIDG (prospect existing)',
        name: p.name,
        nip: p.nip,
        city: p.miejscowosc,
        legal_form: p.krs_legal_form,
        payload: { type: 'existing_prospect', id: p.id, nip: p.nip },
      })
    }

    // Fresh GUS lookup if type=NIP
    if (type === 'nip' && candidates.length === 0) {
      const { data: paramsRow } = await supabase
        .from('params')
        .select('gus_api_key')
        .limit(1)
        .maybeSingle()
      const gusKey = (paramsRow as { gus_api_key?: string } | null)?.gus_api_key
      if (gusKey) {
        try {
          const sessionId = await gusLogin(gusKey)
          const gus = await enrichWithGUS(sessionId, cleanNip)
          if (gus.legal_name) {
            candidates.push({
              source: 'GUS REGON',
              name: gus.legal_name,
              nip: cleanNip,
              city: null,
              legal_form: null,
              payload: { type: 'gus_fresh', nip: cleanNip, raw: gus },
            })
          }
        } catch (err) {
          console.warn('[dispatcher] GUS fail:', err instanceof Error ? err.message : err)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      type,
      results: candidates,
      message: candidates.length === 0 ? 'Nie znaleziono. Wprowadź ręcznie:' : null,
    })
  }

  // 2. Email/phone/URL → DB ILIKE search
  if (type === 'email' || type === 'phone' || type === 'url') {
    const value = type === 'phone' ? normalizePhone(input) : type === 'url' ? extractDomain(input) ?? input : input
    const fields = type === 'email' ? ['email'] : type === 'phone' ? ['phone'] : ['website']
    const prospectFields = type === 'email' ? ['email'] : type === 'phone' ? ['telefon'] : ['www']

    // clients matching
    for (const f of fields) {
      const { data } = await supabase
        .from('clients')
        .select(`id, title, nip, city, krs_legal_form, ${f}`)
        .ilike(f, `%${value}%`)
        .limit(20)
      for (const r of ((data ?? []) as unknown) as Array<{
        id: string
        title: string
        nip: string | null
        city: string | null
        krs_legal_form: string | null
      }>) {
        candidates.push({
          source: `clients (${f})`,
          name: r.title,
          nip: r.nip,
          city: r.city,
          legal_form: r.krs_legal_form,
          payload: { type: 'existing_client', id: r.id },
        })
      }
    }
    // prospects matching
    for (const f of prospectFields) {
      const { data } = await supabase
        .from('ceidg_prospects')
        .select(`id, name, nip, miejscowosc, krs_legal_form, ${f}`)
        .ilike(f, `%${value}%`)
        .limit(20)
      for (const r of ((data ?? []) as unknown) as Array<{
        id: string
        name: string
        nip: string | null
        miejscowosc: string | null
        krs_legal_form: string | null
      }>) {
        candidates.push({
          source: `prospects (${f})`,
          name: r.name,
          nip: r.nip,
          city: r.miejscowosc,
          legal_form: r.krs_legal_form,
          payload: { type: 'existing_prospect', id: r.id },
        })
      }
    }
    return NextResponse.json({
      ok: true,
      type,
      results: candidates.slice(0, 30),
      message: candidates.length === 0 ? 'Nie znaleziono. Wprowadź ręcznie:' : null,
    })
  }

  // 3. name_text → ILIKE на title/name
  const { data: clientMatches } = await supabase
    .from('clients')
    .select('id, title, nip, city, krs_legal_form')
    .ilike('title', `%${input}%`)
    .limit(20)
  for (const r of (clientMatches ?? []) as Array<{
    id: string
    title: string
    nip: string | null
    city: string | null
    krs_legal_form: string | null
  }>) {
    candidates.push({
      source: 'clients',
      name: r.title,
      nip: r.nip,
      city: r.city,
      legal_form: r.krs_legal_form,
      payload: { type: 'existing_client', id: r.id },
    })
  }
  const { data: prospectMatches } = await supabase
    .from('ceidg_prospects')
    .select('id, name, nip, miejscowosc, krs_legal_form')
    .ilike('name', `%${input}%`)
    .limit(20)
  for (const r of (prospectMatches ?? []) as Array<{
    id: string
    name: string
    nip: string | null
    miejscowosc: string | null
    krs_legal_form: string | null
  }>) {
    candidates.push({
      source: 'CEIDG prospects',
      name: r.name,
      nip: r.nip,
      city: r.miejscowosc,
      legal_form: r.krs_legal_form,
      payload: { type: 'existing_prospect', id: r.id },
    })
  }

  // Auto-redirect якщо exact unique match
  if (candidates.length === 1) {
    const c = candidates[0]!
    if (c.payload.type === 'existing_client') {
      return NextResponse.json({ ok: true, type, redirect: `/clients/${c.payload.id}` })
    }
    if (c.payload.type === 'existing_prospect') {
      return NextResponse.json({ ok: true, type, redirect: `/prospects/${c.payload.id}` })
    }
  }

  return NextResponse.json({
    ok: true,
    type,
    results: candidates.slice(0, 30),
    message: candidates.length === 0 ? 'Nie znaleziono. Wprowadź ręcznie:' : null,
  })
}
