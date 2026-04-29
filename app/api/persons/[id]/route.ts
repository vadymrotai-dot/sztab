// app/api/persons/[id]/route.ts
// PATCH — edit person fields. POST event-add via /events sub-route.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface UpdateBody {
  imie?: string
  nazwisko?: string
  email_glowny?: string | null
  email_prywatny?: string | null
  telefon_komorkowy?: string | null
  linkedin_url?: string | null
  data_urodzenia?: string | null
  miesiac_urodzenia?: number | null
  dzien_urodzenia?: number | null
  zainteresowania?: string[]
  mocne_strony?: string[]
  notatki_wewnetrzne?: string | null
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ ok: false, error: 'Niepoprawny id' }, { status: 400 })

  let body: UpdateBody = {}
  try {
    body = (await req.json()) as UpdateBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Niepoprawny JSON' }, { status: 400 })
  }

  // Whitelist fields + sanitize empty strings to null
  const update: Record<string, unknown> = {}
  for (const key of [
    'imie',
    'nazwisko',
    'email_glowny',
    'email_prywatny',
    'telefon_komorkowy',
    'linkedin_url',
    'data_urodzenia',
    'miesiac_urodzenia',
    'dzien_urodzenia',
    'zainteresowania',
    'mocne_strony',
    'notatki_wewnetrzne',
  ] as const) {
    if (key in body) {
      let v = body[key] as unknown
      if (v === '') v = null
      update[key] = v
    }
  }
  // Compute miesiac/dzien з data_urodzenia якщо provided
  if (body.data_urodzenia) {
    const d = new Date(body.data_urodzenia)
    if (!isNaN(d.getTime())) {
      update.miesiac_urodzenia = d.getMonth() + 1
      update.dzien_urodzenia = d.getDate()
    }
  }

  const { error } = await supabase.from('persons').update(update).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
