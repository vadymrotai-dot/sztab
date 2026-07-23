import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      name: string
      filter_pkd?: string[] | null
      filter_zus?: string[] | null
      filter_obyw?: string[] | null
      filter_wojewodztwo?: string | null
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Brak nazwy kampanii' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('fba_campaigns')
      .insert({
        name: body.name.trim(),
        filter_pkd: body.filter_pkd ?? null,
        filter_zus: body.filter_zus ?? null,
        filter_obyw: body.filter_obyw ?? null,
        filter_wojewodztwo: body.filter_wojewodztwo ?? null,
        status: 'DRAFT',
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: data.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
