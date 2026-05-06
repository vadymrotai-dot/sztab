import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_TOKENS = ['pikniko-maxim-2026-discovery-v1']

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, question_id, section_id, answer } = body

    if (!token || !VALID_TOKENS.includes(token)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
    if (!question_id || !section_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const supabase = await createClient()

    const { error } = await supabase.from('discovery_responses').upsert(
      {
        token,
        question_id,
        section_id,
        answer,
      },
      { onConflict: 'token,question_id' },
    )

    if (error) {
      console.error('Discovery save error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
