import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as {
      id: string
      outreach_status: string
      sent_to_fba_at?: string
    }

    if (!body.id || !body.outreach_status) {
      return NextResponse.json({ error: 'Missing id or outreach_status' }, { status: 400 })
    }

    const supabase = await createClient()

    const update: Record<string, string> = {
      outreach_status: body.outreach_status,
    }
    if (body.sent_to_fba_at) {
      update.sent_to_fba_at = body.sent_to_fba_at
    }

    const { error } = await supabase
      .from('fba_prospects')
      .update(update)
      .eq('id', body.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
