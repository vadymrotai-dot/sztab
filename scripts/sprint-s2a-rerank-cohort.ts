// scripts/sprint-s2a-rerank-cohort.ts
// Sprint S2A Phase 4 — recompute matches z S2A signals dla cohort 29.
// Reads pikniko_handoff_cohorts latest entry, fetches financial_statements
// + crbr_beneficiaries per client, computes new score, persists.

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'node:fs/promises'
import { computeMatchesForClient } from '@/lib/matching/engine'
import { executeManagementSQL } from '@/lib/supabase/management'

interface CohortEntity {
  id: string
  type: 'client' | 'prospect'
  rank: number
}

async function main() {
  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: cohort } = await supabase
    .from('pikniko_handoff_cohorts')
    .select('cohort_name, entity_ids')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  const c = cohort as { cohort_name: string; entity_ids: CohortEntity[] }
  const entityIds = c.entity_ids ?? []
  console.log(`Cohort "${c.cohort_name}" — ${entityIds.length} entities\n`)

  // Step 1: enrich clients з latest revenue + BO PL flag за pomocą bulk SQL update
  // Done у-place into clients table (fields exist post Sprint S1).
  const clientIds = entityIds.filter((e) => e.type === 'client').map((e) => e.id)
  if (clientIds.length > 0) {
    // Update latest_revenue_pln у clients table tymczasowy join. We'll
    // pass through clientToTarget which reads direct columns. But ClientRow
    // doesn't have these fields — they're computed on-the-fly. Workaround:
    // patch s2a_signals manually by re-using DB query inside engine.
    //
    // Simplest path: fetch financial_statements + crbr per client, store
    // map, then directly INSERT a synthetic row update — but engine bulk
    // isn't structured for this. Instead: trigger engine.computeMatchesForClient
    // for each — engine's clientToTarget will read direct columns.
    // For revenue/bo_pl to apply, we'd need engine to also fetch them, OR
    // we materialize to clients table. Materializing to clients = leaky
    // schema.
    //
    // S2A scope: ship engine з direct-column signals only (bankruptcy etc.).
    // Revenue + BO PL come з financial_statements + crbr_beneficiaries —
    // we apply them HERE via direct UPDATE на matches.score_breakdown +
    // recompute final score using s2a-signals helper.
  }

  // Direct approach: for each entity recompute via engine, THEN add bonuses
  // for revenue + BO PL post-hoc via SQL UPDATE на matches.
  console.log('━━━ Phase 1: bulk recompute matches з direct-column signals ━━━')
  let recomputed = 0
  for (const e of entityIds) {
    if (e.type !== 'client') continue
    const r = await computeMatchesForClient(supabase, e.id)
    if (r.ok) recomputed++
  }
  console.log(`Recomputed: ${recomputed}/${clientIds.length} clients\n`)

  // Step 2: для каждого entity calculate add-on bonuses (revenue, BO PL)
  // and bump matches.algo_score + score_breakdown
  console.log('━━━ Phase 2: revenue + BO PL bonuses post-hoc ━━━')
  const reportRows: Array<{ nip: string; name: string; old: number; new: number; delta: number; reasons: string[] }> = []

  for (const e of entityIds) {
    if (e.type !== 'client') continue
    // Fetch latest revenue + BO PL flag
    const enrich = await executeManagementSQL(`
      SELECT
        c.nip,
        c.title,
        (SELECT przychody_netto FROM financial_statements
          WHERE client_id = '${e.id}' ORDER BY okres_data_koniec DESC LIMIT 1) AS latest_revenue,
        EXISTS(SELECT 1 FROM crbr_beneficiaries WHERE client_id = '${e.id}' AND kraj_rezydencji = 'PL') AS has_bo_pl,
        c.bankruptcy_flag, c.liquidation_flag, c.restructuring_flag, c.suspended_at,
        c.branch_offices_count, c.last_filing_date
      FROM clients c WHERE c.id = '${e.id}';
    `)
    const row = (enrich.rows ?? [])[0] as
      | {
          nip: string
          title: string
          latest_revenue: string | null
          has_bo_pl: boolean
          bankruptcy_flag: boolean
          liquidation_flag: boolean
          restructuring_flag: boolean
          suspended_at: string | null
          branch_offices_count: number
          last_filing_date: string | null
        }
      | undefined
    if (!row) continue

    // Compute additional bonuses (engine already applied direct-column penalties)
    const rev = row.latest_revenue ? parseFloat(row.latest_revenue) : null
    let revenueBonus = 0
    if (rev !== null && rev > 5_000_000) revenueBonus = 15
    else if (rev !== null && rev > 1_000_000) revenueBonus = 10
    const boBonus = row.has_bo_pl ? 5 : 0
    const addOn = revenueBonus + boBonus
    const reasons: string[] = []
    if (revenueBonus > 0) reasons.push(`+${revenueBonus} revenue=${rev?.toLocaleString('pl')}`)
    if (boBonus > 0) reasons.push('+5 BO PL')

    // Get top-match score before
    const { data: top } = await supabase
      .from('matches')
      .select('id, algo_score, score_breakdown')
      .eq('client_id', e.id)
      .order('algo_score', { ascending: false })
      .limit(1)
      .maybeSingle()
    const oldScore = (top as { algo_score: number } | null)?.algo_score ?? 0

    if (addOn > 0 && top) {
      const matchId = (top as { id: string }).id
      const newScore = Math.min(100, oldScore + addOn)
      // Merge score_breakdown.bonuses additionally
      const sbCurrent = (top as { score_breakdown: Record<string, unknown> }).score_breakdown ?? {}
      const sb = {
        ...sbCurrent,
        total: newScore,
        bonuses: {
          ...(sbCurrent as { bonuses?: Record<string, number> }).bonuses,
          revenue: revenueBonus,
          bo_pl: boBonus,
        },
        reasons: [
          ...((sbCurrent as { reasons?: string[] }).reasons ?? []),
          ...reasons,
        ],
      }
      await supabase
        .from('matches')
        .update({ algo_score: newScore, score_breakdown: sb })
        .eq('id', matchId)
      reportRows.push({
        nip: row.nip,
        name: row.title,
        old: oldScore,
        new: newScore,
        delta: newScore - oldScore,
        reasons,
      })
    } else {
      reportRows.push({
        nip: row.nip,
        name: row.title,
        old: oldScore,
        new: oldScore,
        delta: 0,
        reasons: [],
      })
    }
  }

  // Sort by new score DESC
  reportRows.sort((a, b) => b.new - a.new)

  console.log('\n━━━ COHORT RE-RANK REPORT ━━━')
  const lines: string[] = []
  lines.push('| #  | NIP        | Score old | Score new | Δ    | Reason                       |')
  lines.push('|----|------------|-----------|-----------|------|------------------------------|')
  reportRows.forEach((r, i) => {
    const reasonStr = r.reasons.join(', ').slice(0, 32) || '—'
    lines.push(
      `| ${String(i + 1).padStart(2, ' ')} | ${r.nip.padEnd(10)} | ${String(r.old).padStart(9)} | ${String(r.new).padStart(9)} | ${(r.delta >= 0 ? '+' : '') + r.delta.toString().padStart(3)}  | ${reasonStr.padEnd(28)} |`,
    )
  })
  const out = lines.join('\n')
  console.log(out)

  const movedUp = reportRows.filter((r) => r.delta > 0).length
  const movedDown = reportRows.filter((r) => r.delta < 0).length
  const same = reportRows.filter((r) => r.delta === 0).length
  console.log(`\n${movedUp} moved up, ${movedDown} moved down, ${same} same`)

  await fs.mkdir('tmp', { recursive: true })
  await fs.writeFile(
    'tmp/cohort-rerank-report.md',
    `# Sprint S2A Cohort Re-rank Report\n\n${out}\n\n${movedUp} moved up, ${movedDown} moved down, ${same} same\n`,
  )
  console.log('\n💾 Saved tmp/cohort-rerank-report.md')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
