// app/api/admin/jobs/[id]/route.ts
// GET /api/admin/jobs/{id} — lookup job у in-memory store.
// Limitation: serverless cold starts wipe state. Returns 404 якщо instance
// rolled. Adequate dla short polling window post-POST.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getJob } from '@/lib/jobs'

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
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Nieautoryzowany' }, { status: 401 })
  }
  const job = getJob(id)
  if (!job) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Job not found. Likely instance recycled — bulk POST returns full sync result, polling not strictly needed.',
      },
      { status: 404 },
    )
  }
  return NextResponse.json({ ok: true, data: job })
}
