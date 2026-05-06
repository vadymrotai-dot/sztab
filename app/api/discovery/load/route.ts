import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_TOKENS = ['pikniko-maxim-2026-discovery-v1']

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('t')

    if (!token || !VALID_TOKENS.includes(token)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('discovery_responses')
      .select('question_id, answer')
      .eq('token', token)

    if (error) {
      console.error('Discovery load error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const responses: Record<string, unknown> = {}
    for (const row of data || []) {
      responses[row.question_id] = row.answer
    }

    return NextResponse.json({ responses })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
