// app/api/persons/[id]/events/route.ts
// POST — add person event.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface EventBody {
  typ?: string
  data?: string | null
  miesiac?: number | null
  dzien?: number | null
  opis?: string
  repeat_yearly?: boolean
}

const VALID_TYPES = [
  'urodziny',
  'imieniny',
  'rocznica_pracy',
  'rocznica_firmy',
  'nagroda',
  'awans',
  'wystąpienie',
  'inne',
]

export async function POST(
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
    return NextResponse.json({ ok: false, error: 'Niepoprawny person id' }, { status: 400 })

  let body: EventBody = {}
  try {
    body = (await req.json()) as EventBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Niepoprawny JSON' }, { status: 400 })
  }
  if (!body.typ || !VALID_TYPES.includes(body.typ)) {
    return NextResponse.json(
      { ok: false, error: `Wymagany typ: ${VALID_TYPES.join('|')}` },
      { status: 400 },
    )
  }

  let miesiac = body.miesiac ?? null
  let dzien = body.dzien ?? null
  if (body.data) {
    const d = new Date(body.data)
    if (!isNaN(d.getTime())) {
      miesiac = d.getMonth() + 1
      dzien = d.getDate()
    }
  }

  const { error } = await supabase.from('person_events').insert({
    person_id: id,
    typ: body.typ,
    data: body.data ?? null,
    miesiac,
    dzien,
    opis: body.opis ?? null,
    repeat_yearly: body.repeat_yearly ?? false,
    zrodlo: 'manual',
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
