// scripts/score-prospects.ts
// Phase 2.6 / Step 3 runner: apply Layer 1 filters + Layer 2 scoring
// na ceidg_prospects → upsert do ceidg_prospect_scores.
//
// Run:
//   $env:SUPABASE_SERVICE_ROLE_KEY="<key>"
//   pnpm dlx tsx scripts/score-prospects.ts [--rescore] [--version=v2] [--max=N]
//
// Flags:
//   --rescore       DELETE wszystkie scores dla podanej version, potem rescore
//   --version=vX    scoring_version (default 'v1'); pozwala dual-writes A/B
//   --max=N         cap N prospects do scoringu (dla testów)

import { createClient } from '@supabase/supabase-js'

import {
  applyDeterministicFilters,
  type ScoreableProspect,
} from '@/lib/ceidg/filters'
import { scoreProspect } from '@/lib/ceidg/scoring'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

// ────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────

interface CliFlags {
  rescore: boolean
  version: string
  max: number | null
}

function parseCli(): CliFlags {
  const args = process.argv.slice(2)
  let rescore = false
  let version = 'v1'
  let max: number | null = null
  for (const arg of args) {
    if (arg === '--rescore') rescore = true
    else if (arg.startsWith('--version=')) {
      version = arg.split('=')[1] ?? 'v1'
      if (!version) {
        console.error(`❌ Empty --version`)
        process.exit(1)
      }
    } else if (arg.startsWith('--max=')) {
      const n = Number.parseInt(arg.split('=')[1] ?? '', 10)
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`❌ Invalid --max value: "${arg}"`)
        process.exit(1)
      }
      max = n
    } else {
      console.error(`❌ Unknown arg: ${arg}`)
      process.exit(1)
    }
  }
  return { rescore, version, max }
}

// ────────────────────────────────────────────────────────────
// DB shapes
// ────────────────────────────────────────────────────────────

interface ProspectRow {
  id: string
  status: string
  pkd_main: string | null
  pkd_all: string[] | null
  wojewodztwo: string | null
  miejscowosc: string | null
  name: string
  owner_name: string | null
  email: string | null
  telefon: string | null
  data_rozpoczecia: string | null
  raw_data: unknown
}

interface ScoreInsertRow {
  prospect_id: string
  sklep_score: number
  restaurant_score: number
  catering_score: number
  cafe_score: number
  horeca_meta_score: number
  dominant_channel: string
  is_chain_franchise: boolean
  chain_brand: string | null
  filter_passed: boolean
  filter_exclusion_reason: string | null
  score_breakdown: unknown
  scoring_version: string
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────

async function main() {
  const flags = parseCli()
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supaKey) {
    console.error('❌ Brak SUPABASE_SERVICE_ROLE_KEY w env')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(
    `\n[SCORING] version=${flags.version}, rescore=${flags.rescore}, max=${flags.max ?? '∞'}\n`,
  )

  // ── Optional --rescore: delete existing scores for version ──
  if (flags.rescore) {
    const { error, count } = await supabase
      .from('ceidg_prospect_scores')
      .delete({ count: 'exact' })
      .eq('scoring_version', flags.version)
    if (error) {
      console.error('❌ Delete failed:', error.message)
      process.exit(1)
    }
    console.log(
      `[SCORING] Cleared ${count ?? 0} existing rows dla version=${flags.version}`,
    )
  }

  // ── Fetch already-scored IDs (for default idempotent mode) ──
  const { data: scored, error: scoredErr } = await supabase
    .from('ceidg_prospect_scores')
    .select('prospect_id')
    .eq('scoring_version', flags.version)
  if (scoredErr) {
    console.error('❌ Read scored failed:', scoredErr.message)
    process.exit(1)
  }
  const scoredSet = new Set<string>(
    (scored ?? []).map((r) => r.prospect_id as string),
  )

  // ── Fetch prospects (max + scoredSet.size to ensure --max post-filter) ──
  const fetchLimit =
    flags.max !== null ? flags.max + scoredSet.size : 100_000
  const { data: prospects, error: pErr } = await supabase
    .from('ceidg_prospects')
    .select(
      'id,status,pkd_main,pkd_all,wojewodztwo,miejscowosc,name,owner_name,email,telefon,data_rozpoczecia,raw_data',
    )
    .limit(fetchLimit)
  if (pErr) {
    console.error('❌ Read prospects failed:', pErr.message)
    process.exit(1)
  }

  const todo = (prospects ?? []).filter(
    (p) => !scoredSet.has(p.id as string),
  ) as ProspectRow[]
  const toProcess = flags.max !== null ? todo.slice(0, flags.max) : todo

  console.log(
    `[SCORING] Already scored: ${scoredSet.size}, To process: ${toProcess.length}\n`,
  )

  if (toProcess.length === 0) {
    console.log('✓ Nothing to score.')
    return
  }

  // ── Score each ──
  const scoreRows: ScoreInsertRow[] = []
  const channelCounts: Record<string, number> = {
    sklep: 0,
    restaurant: 0,
    catering: 0,
    cafe: 0,
    multi: 0,
  }
  const filterReasons: Record<string, number> = {}
  const ownerAffinityCounts = { ua: 0, asian: 0, other: 0 }
  const chainBrandCounts: Record<string, number> = {}
  let chainCount = 0

  for (const raw of toProcess) {
    const p: ScoreableProspect = {
      id: raw.id,
      status: raw.status,
      pkd_main: raw.pkd_main,
      pkd_all: raw.pkd_all,
      wojewodztwo: raw.wojewodztwo,
      miejscowosc: raw.miejscowosc,
      name: raw.name,
      owner_name: raw.owner_name,
      email: raw.email,
      telefon: raw.telefon,
      data_rozpoczecia: raw.data_rozpoczecia,
      raw_data: raw.raw_data,
    }

    const filter = applyDeterministicFilters(p)
    if (!filter.passed) {
      const reason = filter.reason ?? 'unknown'
      filterReasons[reason] = (filterReasons[reason] ?? 0) + 1
      scoreRows.push({
        prospect_id: p.id,
        sklep_score: 0,
        restaurant_score: 0,
        catering_score: 0,
        cafe_score: 0,
        horeca_meta_score: 0,
        dominant_channel: 'sklep', // arbitrary; UI will hide filtered rows
        is_chain_franchise: false,
        chain_brand: null,
        filter_passed: false,
        filter_exclusion_reason: reason,
        score_breakdown: {
          filter: { passed: false, reason },
        },
        scoring_version: flags.version,
      })
      continue
    }

    const result = scoreProspect(p)
    if (result.is_chain_franchise) {
      chainCount += 1
      const brand = result.chain_brand ?? 'unknown'
      chainBrandCounts[brand] = (chainBrandCounts[brand] ?? 0) + 1
    }
    channelCounts[result.dominant_channel] =
      (channelCounts[result.dominant_channel] ?? 0) + 1
    // Owner-affinity bucketing (shared across channels — read from sklep)
    const ownerPts = result.score_breakdown.sklep.owner
    if (ownerPts === 15) ownerAffinityCounts.ua += 1
    else if (ownerPts === 10) ownerAffinityCounts.asian += 1
    else ownerAffinityCounts.other += 1
    scoreRows.push({
      prospect_id: p.id,
      sklep_score: result.sklep_score,
      restaurant_score: result.restaurant_score,
      catering_score: result.catering_score,
      cafe_score: result.cafe_score,
      horeca_meta_score: result.horeca_meta_score,
      dominant_channel: result.dominant_channel,
      is_chain_franchise: result.is_chain_franchise,
      chain_brand: result.chain_brand,
      filter_passed: true,
      filter_exclusion_reason: null,
      score_breakdown: result.score_breakdown,
      scoring_version: flags.version,
    })
  }

  // ── Batch upsert (50 per call) ──
  console.log(
    `[SCORING] Upserting ${scoreRows.length} rows w batches of 50...`,
  )
  for (let i = 0; i < scoreRows.length; i += 50) {
    const batch = scoreRows.slice(i, i + 50)
    const { error: upErr } = await supabase
      .from('ceidg_prospect_scores')
      .upsert(batch, {
        onConflict: 'prospect_id,scoring_version',
        ignoreDuplicates: false,
      })
    if (upErr) {
      console.error(
        `❌ Upsert batch ${i}-${i + batch.length - 1} failed:`,
        upErr.message,
      )
      process.exit(1)
    }
    console.log(`  batch ${i}-${i + batch.length - 1} done (${batch.length})`)
  }

  // ── Summary ──
  console.log('\n══════ Summary ══════')
  const passedRows = scoreRows.filter((s) => s.filter_passed)
  const excludedRows = scoreRows.filter((s) => !s.filter_passed)
  console.log(`Total scored:      ${scoreRows.length}`)
  console.log(`Filter passed:     ${passedRows.length}`)
  console.log(`Filter excluded:   ${excludedRows.length}`)
  for (const [k, v] of Object.entries(filterReasons)) {
    console.log(`  - ${k.padEnd(28)} ${v}`)
  }
  console.log(`Chain franchisees: ${chainCount}`)
  if (chainCount > 0) {
    for (const [b, v] of Object.entries(chainBrandCounts).sort(([, a], [, c]) => c - a)) {
      console.log(`  - ${b.padEnd(15)} ${v}`)
    }
  }
  console.log('\nOwner-affinity distribution (passed):')
  console.log(`  ua (cyrillic/UA-suffix/UA-firstname)  ${ownerAffinityCounts.ua}`)
  console.log(`  asian (vn/cn/kr/jp)                   ${ownerAffinityCounts.asian}`)
  console.log(`  other                                 ${ownerAffinityCounts.other}`)
  console.log('\nDominant channel distribution (passed):')
  for (const [k, v] of Object.entries(channelCounts).sort(
    ([, a], [, b]) => b - a,
  )) {
    console.log(`  ${k.padEnd(12)} ${v}`)
  }

  // ── Top 10 by horeca_meta_score ──
  const top = passedRows
    .sort((a, b) => b.horeca_meta_score - a.horeca_meta_score)
    .slice(0, 10)
  if (top.length > 0) {
    const ids = top.map((s) => s.prospect_id)
    const { data: topProspects } = await supabase
      .from('ceidg_prospects')
      .select('id,name,owner_name,pkd_main,wojewodztwo,miejscowosc')
      .in('id', ids)
    const pmap = new Map<string, ProspectRow>(
      ((topProspects as ProspectRow[] | null) ?? []).map((p) => [p.id, p]),
    )

    console.log('\n══════ Top 10 prospects by horeca_meta_score ══════')
    console.log(
      'rk | meta | sk/rs/ct/cf      | dominant   | chain         | name (owner)',
    )
    console.log('-'.repeat(115))
    top.forEach((s, i) => {
      const p = pmap.get(s.prospect_id)
      const name = (p?.name ?? '?').slice(0, 32)
      const owner = (p?.owner_name ?? '?').slice(0, 22)
      const chainTag = s.is_chain_franchise ? `Y[${s.chain_brand}]` : 'N'
      const scoresLine =
        `${String(s.sklep_score).padStart(3)}/${String(s.restaurant_score).padStart(3)}/${String(s.catering_score).padStart(3)}/${String(s.cafe_score).padStart(3)}`
      console.log(
        `${String(i + 1).padStart(2)} | ${String(s.horeca_meta_score).padStart(4)} | ${scoresLine.padEnd(16)} | ${s.dominant_channel.padEnd(10)} | ${chainTag.padEnd(13)} | ${name} (${owner})`,
      )
    })
  }

  console.log('\n✅ Scoring done.\n')
}

main().catch((err) => {
  console.error('\n❌ Crashed:', err)
  process.exit(1)
})
