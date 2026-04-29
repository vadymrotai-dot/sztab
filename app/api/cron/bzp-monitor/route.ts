// app/api/cron/bzp-monitor/route.ts
// Sprint K / Phase 6 — daily BZP monitor cron.
// Schedule: vercel.json "0 3 * * *" (daily 03:00 UTC).
//
// Pipeline:
//   1. fetchRecentHorecaNotices(24h) — pulls food/catering CPV
//   2. For each notice з winner_nip — try to link by clients.nip або
//      ceidg_prospects.nip; insert/upsert у bzp_tenders.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchRecentHorecaNotices } from '@/lib/enrichment/bzp'
import { startCronRun, finishCronRun } from '@/lib/cron-runs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = await createClient()
  const runId = await startCronRun(supabase, 'bzp-monitor')

  try {
    const notices = await fetchRecentHorecaNotices(24)
    let inserted = 0
    let linked = 0

    for (const n of notices) {
      const winnerNip = n.winner?.nip?.replace(/\D/g, '') ?? null

      // Try to link by NIP
      let clientId: string | null = null
      let prospectId: string | null = null
      if (winnerNip) {
        const [{ data: c }, { data: p }] = await Promise.all([
          supabase
            .from('clients')
            .select('id')
            .eq('nip', winnerNip)
            .maybeSingle(),
          supabase
            .from('ceidg_prospects')
            .select('id')
            .eq('nip', winnerNip)
            .maybeSingle(),
        ])
        if (c) {
          clientId = (c as { id: string }).id
          linked++
        } else if (p) {
          prospectId = (p as { id: string }).id
          linked++
        }
      }

      const { error } = await supabase.from('bzp_tenders').upsert(
        {
          bzp_notice_id: n.noticeId,
          client_id: clientId,
          prospect_id: prospectId,
          winner_nip: winnerNip,
          winner_name: n.winner?.name ?? null,
          ordering_party: n.orderingParty.name,
          ordering_party_type: n.orderingParty.type,
          cpv_codes: n.cpvCodes,
          subject: n.subject,
          award_value_pln: n.contractValue,
          award_date: n.awardDate,
          contract_period: n.contractPeriod,
          raw_payload: n.raw,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'bzp_notice_id' },
      )
      if (!error) inserted++
    }

    await finishCronRun(supabase, runId, {
      status: 'success',
      pairs_processed: notices.length,
      meta: { fetched: notices.length, inserted, linked_to_known: linked },
    })

    return NextResponse.json({
      ok: true,
      summary: { fetched: notices.length, inserted, linked },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await finishCronRun(supabase, runId, { status: 'error', error_message: msg })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
