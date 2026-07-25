import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createApolloClient } from '@/lib/integrations/apollo'

export async function POST(req: Request) {
  try {
    const { id } = await req.json() as { id: string }
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const supabase = await createClient()

    // Отримати ключ Apollo з params
    const { data: params } = await supabase
      .from('params')
      .select('apollo_api_key')
      .single()

    const apollo = await createApolloClient(params?.apollo_api_key)
    if (!apollo) return NextResponse.json({ error: 'Apollo API key not configured' }, { status: 503 })

    // Отримати запис з БД
    const { data: prospect, error: fetchErr } = await supabase
      .from('fba_prospects')
      .select('id, owner_name, name, www')
      .eq('id', id)
      .single()

    if (fetchErr || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
    }

    // Розбити owner_name на ім'я і прізвище
    const nameParts = (prospect.owner_name ?? '').trim().split(/\s+/)
    const first_name = nameParts[0] ?? ''
    const last_name = nameParts.slice(1).join(' ') ?? ''

    // Запит до Apollo
    const result = await apollo.enrichPerson({
      first_name,
      last_name,
      organization_name: prospect.name,
      domain: prospect.www ?? null,
    })

    // Оновити в БД
    const now = new Date().toISOString()
    const update: Record<string, unknown> = {
      apollo_enriched_at: now,
    }
    const dataSourceUpdate: Record<string, string> = {}

    if (result.email) {
      update.email = result.email
      dataSourceUpdate.email = 'apollo'
    }
    if (result.linkedin_url) {
      update.linkedin_url = result.linkedin_url
      dataSourceUpdate.linkedin_url = 'apollo'
    }
    if (result.phone) {
      update.telefon = result.phone
      dataSourceUpdate.telefon = 'apollo'
    }
    if (Object.keys(dataSourceUpdate).length > 0) {
      update.data_source = dataSourceUpdate
    }

    await supabase
      .from('fba_prospects')
      .update(update)
      .eq('id', id)

    return NextResponse.json({
      ok: true,
      email: result.email,
      linkedin_url: result.linkedin_url,
      telefon: result.phone,
      apollo_enriched_at: now,
      error: result.error,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
