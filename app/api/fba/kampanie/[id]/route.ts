import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const body = await req.json() as {
      name?: string
      filter_pkd?: string[] | null
      filter_zus?: string[] | null
      filter_obyw?: string[] | null
      filter_regions?: string[] | null
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('fba_campaigns')
      .update({
        ...(body.name && { name: body.name }),
        filter_pkd: body.filter_pkd ?? null,
        filter_zus: body.filter_zus ?? null,
        filter_obyw: body.filter_obyw ?? null,
        filter_regions: body.filter_regions ?? null,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const supabase = await createClient()

    const { error } = await supabase
      .from('fba_campaigns')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
