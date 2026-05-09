// scripts/sync-krs-bootstrap.ts
// Phase 2.8 / S-CORE.2 — KRS bulk listing through rejestr.io
// wyszukiwanie-organizacji.
//
// Pattern-match scripts/sync-ceidg-bootstrap.ts (pkd × wojewodztwo paginator
// з resumable state file + ceidg_sync_runs telemetry), але:
//   • LISTING-ONLY — no per-org detail call (Phase 2.8a; per-org enrichment
//     defer to Phase 2.8b cron).
//   • Write target = ceidg_prospects з source='krs', ceidg_id=NULL.
//   • ON CONFLICT (krs_number) WHERE krs_number IS NOT NULL DO UPDATE.
//   • Per Strategy Shift 03.05.2026: NO status filter — beremy WSZYSTKIE.
//
// PRECONDITIONS (Vadym must apply BEFORE first non-dry-run):
//   1. Migration 055_unique_constraints_multi_source.sql applied
//      (drops NOT NULL on ceidg_id + adds partial UNIQUE on krs_number).
//   2. .env.local з KRS_REJESTR_API_TOKEN + SUPABASE_SERVICE_ROLE_KEY.
//
// Pre-flight check у script: перший UPSERT впаде з NOT NULL ceidg_id
// violation якщо migration 055 не applied → log clear message + exit.
//
// Run:
//   $env:KRS_REJESTR_API_TOKEN = "<token>"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<key>"
//   pnpm dlx tsx scripts/sync-krs-bootstrap.ts [--dry-run] [--max-pages=N] [--reset] [--base-path=/path]
//
// Flags:
//   --dry-run         skip DB writes (no upsert, no sync_run row, no state save)
//   --max-pages=N     stop after N pages (counts within current invocation)
//   --reset           delete state file before start (fresh run)
//   --base-path=PATH  override empirical basePath (default '/krs/wyszukaj').
//                     Use after probe знайшов working path.

import '@/lib/env'

import fs from 'node:fs/promises'
import path from 'node:path'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import {
  searchOrganizations,
  DEFAULT_SEARCH_BASE_PATH,
  type KrsSearchFilters,
  type KrsSearchKontakt,
  type KrsSearchGlownaOsoba,
  type KrsSearchNazwy,
  type KrsSearchOrgItem,
  type KrsSearchResponse,
  type KrsSearchStan,
} from '@/lib/rejestrio/search'

// ────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

// Per Strategy Shift 03.05.2026: NO status filter. Mode B = WSZYSTKIE.
// Beremy всі: AKTYWNA / WYKREŚLONA / W LIKWIDACJI / W UPADŁOŚCI / W ZAWIESZENIU.
//
// PKD format: KRS canonical з крапками '46.39.Z' (per real test 2026-05-04).
// CEIDG використовує format без крапок '4639Z' — для DB writes ми
// strip dots through PKD_CEIDG_STYLE щоб ceidg_prospects.pkd_main був
// consistent з existing CEIDG rows.
//
// Phase B parallel sync (10.05.2026) — додано CLI args --pkd і --woj
// щоб Vadym міг паралельно sync 12 PKD×woj combinations через окремі
// PowerShell вікна. Per-filter state file ensures resume не corrupts
// progress between combinations.
const DEFAULT_PKD = '46.39.Z'
const DEFAULT_WOJ = '14' // Mazowieckie
const LIMIT = 50

// Module-level mutable bindings — assigned у main() з CLI args.
// Default values match Phase 2.8 historical config (305 firms на Mazowieckie).
let STATE_FILE = path.resolve(process.cwd(), '.krs-progress.json')
let STATE_TMP = STATE_FILE + '.tmp'
let FILTERS: KrsSearchFilters = {
  przewazajacy_pkd: DEFAULT_PKD,
  terc_wojewodztwo: DEFAULT_WOJ,
}
/**
 * Strip крапок з KRS PKD format → CEIDG-style без крапок для DB write
 * consistency з existing CEIDG rows.
 *   '46.39.Z' → '4639Z'
 */
let PKD_CEIDG_STYLE = DEFAULT_PKD.replace(/\./g, '')

// ────────────────────────────────────────────────────────────
// TERC → wojewodztwo decode (UPPERCASE per ceidg_prospects 014 convention)
// ────────────────────────────────────────────────────────────

const TERC_TO_WOJEWODZTWO: Record<string, string> = {
  '02': 'DOLNOŚLĄSKIE',
  '04': 'KUJAWSKO-POMORSKIE',
  '06': 'LUBELSKIE',
  '08': 'LUBUSKIE',
  '10': 'ŁÓDZKIE',
  '12': 'MAŁOPOLSKIE',
  '14': 'MAZOWIECKIE',
  '16': 'OPOLSKIE',
  '18': 'PODKARPACKIE',
  '20': 'PODLASKIE',
  '22': 'POMORSKIE',
  '24': 'ŚLĄSKIE',
  '26': 'ŚWIĘTOKRZYSKIE',
  '28': 'WARMIŃSKO-MAZURSKIE',
  '30': 'WIELKOPOLSKIE',
  '32': 'ZACHODNIOPOMORSKIE',
}

function decodeTerc(terc: string | undefined | null): string | null {
  if (!terc) return null
  return TERC_TO_WOJEWODZTWO[terc] ?? null
}

// ────────────────────────────────────────────────────────────
// KRS status compute (precedence: dead → upadłość → likwidacja → zawieszenie → aktywna)
// ────────────────────────────────────────────────────────────

function computeKrsStatus(stan: KrsSearchStan | undefined): string {
  if (!stan) return 'AKTYWNA'
  // ⚠ Real response 2026-05-04: czy_wykreslona має czy_ префікс,
  // a w_likwidacji / w_upadlosci / w_zawieszeniu — БЕЗ czy_ (literal).
  if (stan.czy_wykreslona === true) return 'WYKREŚLONA'
  if (stan.w_upadlosci === true) return 'W UPADŁOŚCI'
  if (stan.w_likwidacji === true) return 'W LIKWIDACJI'
  if (stan.w_zawieszeniu === true) return 'W ZAWIESZENIU'
  return 'AKTYWNA'
}

// ────────────────────────────────────────────────────────────
// Name resolution з KRS-${number} fallback (per Q3)
// ────────────────────────────────────────────────────────────

function extractName(nazwy: KrsSearchNazwy | undefined, krsId: string): string {
  return (
    nazwy?.pelna ?? nazwy?.skrocona ?? nazwy?.aktualna ?? `KRS-${krsId}`
  )
}

// Note: padKrsNumber removed (was for org.id → 10-digit padded) —
// real response 2026-05-04 confirmed org.numery.krs ВЖЕ повертає
// 10-digit padded string (e.g. '0001234340').

// ────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────

interface CliFlags {
  dryRun: boolean
  maxPages: number | null
  reset: boolean
  basePath: string
  /** Phase B parallel sync — KRS canonical PKD з крапками '46.31.Z'. */
  pkd: string
  /** Phase B parallel sync — TERC woj code 2-digit (e.g. '14'=Mazowieckie). */
  wojCode: string
}

function parseCli(): CliFlags {
  const args = process.argv.slice(2)
  let dryRun = false
  let maxPages: number | null = null
  let reset = false
  let basePath: string = DEFAULT_SEARCH_BASE_PATH
  let pkd: string = DEFAULT_PKD
  let wojCode: string = DEFAULT_WOJ
  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--reset') reset = true
    else if (arg.startsWith('--max-pages=')) {
      const n = Number.parseInt(arg.split('=')[1] ?? '', 10)
      if (Number.isFinite(n) && n > 0) maxPages = n
      else {
        console.error(`❌ Invalid --max-pages value: "${arg}"`)
        process.exit(1)
      }
    } else if (arg.startsWith('--base-path=')) {
      const p = arg.split('=')[1] ?? ''
      if (p.length > 0) basePath = p
      else {
        console.error(`❌ Empty --base-path`)
        process.exit(1)
      }
    } else if (arg.startsWith('--pkd=')) {
      const p = arg.split('=')[1] ?? ''
      // KRS canonical format = N.NN.X (e.g. 46.31.Z, 46.38.Z, 46.39.Z)
      if (!/^\d{2}\.\d{2}\.[A-Z]$/.test(p)) {
        console.error(
          `❌ Invalid --pkd: "${p}" (expected canonical N.NN.X, np. 46.39.Z)`,
        )
        process.exit(1)
      }
      pkd = p
    } else if (arg.startsWith('--woj=')) {
      const w = arg.split('=')[1] ?? ''
      // TERC 2-digit code (02..32 even numbers per Polish administrative split)
      if (!/^\d{2}$/.test(w)) {
        console.error(
          `❌ Invalid --woj: "${w}" (expected 2-digit TERC, np. 14=Mazowieckie)`,
        )
        process.exit(1)
      }
      wojCode = w
    } else {
      console.error(`❌ Unknown arg: ${arg}`)
      process.exit(1)
    }
  }
  return { dryRun, maxPages, reset, basePath, pkd, wojCode }
}

// Per-filter state file щоб паралельні sync (different PKD×woj у окремих
// PowerShell windows) не corrupt'ed each other's progress. Filename
// pattern: .krs-progress-<pkd-no-dots>-<woj>.json
function stateFileFor(pkd: string, wojCode: string): string {
  const pkdNoDots = pkd.replace(/\./g, '')
  return path.resolve(
    process.cwd(),
    `.krs-progress-${pkdNoDots}-${wojCode}.json`,
  )
}

// ────────────────────────────────────────────────────────────
// State (atomic write, crash-safe resume)
// ────────────────────────────────────────────────────────────

interface ProgressState {
  version: 1
  filters: KrsSearchFilters
  base_path: string
  limit: number
  run_id: string | null
  started_at: string
  last_processed_page: number
  processed_pages: number
  inserted_count: number
  updated_count: number
  skipped_count: number
  api_calls_count: number
}

async function loadState(): Promise<ProgressState | null> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8')
    return JSON.parse(raw) as ProgressState
  } catch {
    return null
  }
}

async function saveState(state: ProgressState): Promise<void> {
  await fs.writeFile(STATE_TMP, JSON.stringify(state, null, 2), 'utf-8')
  await fs.rename(STATE_TMP, STATE_FILE)
}

async function deleteState(): Promise<void> {
  try {
    await fs.unlink(STATE_FILE)
  } catch {
    // not exists — fine
  }
}

// ────────────────────────────────────────────────────────────
// Mapper — KrsSearchOrgItem → ceidg_prospects insert row
// ────────────────────────────────────────────────────────────

interface KrsProspectInsert {
  ceidg_id: string | null
  nip: string | null
  regon: string | null
  name: string
  status: string
  source: string
  // Phase 2.8 Variant B (per migration 056) — extracted з KRS listing
  email: string | null
  decision_maker_name: string | null
  // KRS overlay (per migration 021)
  krs_number: string | null
  krs_full_name: string | null
  krs_legal_form: string | null
  krs_status: string | null
  krs_data: unknown
  krs_last_checked: string
  // Address columns (existing у 014)
  wojewodztwo: string | null
  miejscowosc: string | null
  kod_pocztowy: string | null
  ulica: string | null
  // PKD columns (existing у 014). pkd_main = single, pkd_all = array.
  pkd_main: string | null
  pkd_all: string[] | null
  raw_data: unknown
}

function mapToInsert(org: KrsSearchOrgItem): KrsProspectInsert {
  // org.numery.krs already 10-digit padded per real response 2026-05-04.
  // Fallback на String(org.id) if numery.krs відсутній (deg edge case).
  const krsNumber = org.numery?.krs ?? String(org.id)
  const status = computeKrsStatus(org.stan)
  return {
    ceidg_id: null, // KRS firms не мають CEIDG ID
    nip: org.numery?.nip ?? null,
    regon: org.numery?.regon ?? null,
    name: extractName(org.nazwy, krsNumber),
    status, // NOT NULL satisfied via computeKrsStatus default 'AKTYWNA'
    source: 'krs',
    // Phase 2.8 Variant B — kontakt + glowna_osoba extraction
    email: org.kontakt?.emaile?.[0] ?? null,
    decision_maker_name: org.glowna_osoba?.imiona_i_nazwisko ?? null,
    // KRS overlay
    krs_number: krsNumber,
    krs_full_name: org.nazwy?.pelna ?? null,
    krs_legal_form: org.stan?.forma_prawna ?? null,
    krs_status: status,
    krs_data: org,
    krs_last_checked: new Date().toISOString(),
    // Address — corrected per real shape:
    //   adres.kod (not kod_pocztowy)
    //   adres.teryt.wojewodztwo (nested, not flat terc_wojewodztwo)
    wojewodztwo: decodeTerc(org.adres?.teryt?.wojewodztwo), // UPPERCASE
    miejscowosc: org.adres?.miejscowosc ?? null,
    kod_pocztowy: org.adres?.kod ?? null,
    ulica: org.adres?.ulica ?? null,
    // PKD: known from FILTERS query (ВСІ rows у цьому batch матимуть
    // PKD = FILTERS.przewazajacy_pkd). PKD_CEIDG_STYLE strips dots для
    // consistency з existing CEIDG rows у DB ('4639Z' not '46.39.Z').
    pkd_main: PKD_CEIDG_STYLE || null,
    pkd_all: PKD_CEIDG_STYLE ? [PKD_CEIDG_STYLE] : null,
    raw_data: org,
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const totalSec = Math.round(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min < 60) return `${min}m${sec.toString().padStart(2, '0')}s`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${m.toString().padStart(2, '0')}m`
}

/**
 * Detect Postgres NOT NULL violation на ceidg_id — signal що migration 055
 * не applied. Postgres SQLSTATE 23502 = not_null_violation. Supabase JS
 * error.message типово: 'null value in column "ceidg_id" of relation
 * "ceidg_prospects" violates not-null constraint'.
 */
function isMigration055NotApplied(err: unknown): boolean {
  if (!err) return false
  const obj = err as { code?: string; message?: string }
  const code = obj.code ?? ''
  const msg = obj.message ?? (err instanceof Error ? err.message : String(err))
  if (code === '23502' && /ceidg_id/i.test(msg)) return true
  return /ceidg_id/i.test(msg) && /(not.null|null value)/i.test(msg)
}

function bailOnMigration055(): never {
  console.error('\n❌ Migration 055 не applied — INSERT провалився на NOT NULL ceidg_id.')
  console.error('   Vadym, apply migration 055 спершу:')
  console.error('     pnpm dlx tsx scripts/apply-migration.ts scripts/055_unique_constraints_multi_source.sql')
  console.error('   Або вручну через Supabase Studio SQL editor.')
  console.error('   Migration drops NOT NULL на ceidg_id + adds UNIQUE на krs_number partial.\n')
  process.exit(1)
}

/**
 * Detect Postgres undefined column error на decision_maker_name — signal
 * що migration 056 не applied. Postgres SQLSTATE 42703 = undefined_column.
 * Supabase JS error.message типово: 'column "decision_maker_name" of
 * relation "ceidg_prospects" does not exist'.
 */
function isMigration056NotApplied(err: unknown): boolean {
  if (!err) return false
  const obj = err as { code?: string; message?: string }
  const code = obj.code ?? ''
  const msg = obj.message ?? (err instanceof Error ? err.message : String(err))
  if (code === '42703' && /decision_maker_name/i.test(msg)) return true
  return /decision_maker_name/i.test(msg) && /(does not exist|undefined column)/i.test(msg)
}

function bailOnMigration056(): never {
  console.error('\n❌ Migration 056 не applied — INSERT провалився на column "decision_maker_name".')
  console.error('   Vadym, apply migration 056 спершу:')
  console.error('     pnpm dlx tsx scripts/apply-migration.ts scripts/056_email_decision_maker_columns.sql')
  console.error('   Або вручну через Supabase Studio SQL editor.')
  console.error('   Migration adds decision_maker_name column + email index (idempotent).\n')
  process.exit(1)
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────

async function main() {
  const flags = parseCli()
  const krsKey = process.env.KRS_REJESTR_API_TOKEN
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!krsKey) {
    console.error('❌ Brak KRS_REJESTR_API_TOKEN w env')
    console.error('   $env:KRS_REJESTR_API_TOKEN = "<token>"  (PowerShell)')
    process.exit(1)
  }
  if (!flags.dryRun && !supaKey) {
    console.error('❌ Brak SUPABASE_SERVICE_ROLE_KEY w env (wymagany unless --dry-run)')
    process.exit(1)
  }

  // Apply CLI args до module-level bindings (paralel sync support).
  STATE_FILE = stateFileFor(flags.pkd, flags.wojCode)
  STATE_TMP = STATE_FILE + '.tmp'
  FILTERS = {
    przewazajacy_pkd: flags.pkd,
    terc_wojewodztwo: flags.wojCode,
  }
  PKD_CEIDG_STYLE = flags.pkd.replace(/\./g, '')

  const wojLabel = decodeTerc(flags.wojCode) ?? `woj-${flags.wojCode}`

  console.log('\n══════ KRS bootstrap sync (Phase 2.8 + Phase B parallel) ══════')
  console.log('  PKD:        ', flags.pkd, `(→ DB style: ${PKD_CEIDG_STYLE})`)
  console.log('  woj:        ', flags.wojCode, `(${wojLabel})`)
  console.log('  filters:    ', JSON.stringify(FILTERS))
  console.log('  base path:  ', flags.basePath)
  console.log('  limit:      ', LIMIT)
  console.log('  dry-run:    ', flags.dryRun)
  console.log('  max-pages:  ', flags.maxPages ?? '∞')
  console.log('  state file: ', STATE_FILE)
  console.log()

  if (flags.reset) {
    await deleteState()
    console.log(`  ↺ state reset (deleted ${path.basename(STATE_FILE)})\n`)
  }

  // ── Load or init state ──
  let state = await loadState()
  if (state) {
    if (state.version !== 1) {
      console.error(`❌ Unsupported state version ${state.version}, --reset required`)
      process.exit(1)
    }
    if (JSON.stringify(state.filters) !== JSON.stringify(FILTERS)) {
      console.error('❌ State filters mismatch:')
      console.error('   state:  ', JSON.stringify(state.filters))
      console.error('   current:', JSON.stringify(FILTERS))
      console.error('   Use --reset to start fresh.')
      process.exit(1)
    }
    if (state.base_path !== flags.basePath) {
      console.error('❌ State base_path mismatch:')
      console.error('   state:  ', state.base_path)
      console.error('   current:', flags.basePath)
      console.error('   Use --reset to start fresh.')
      process.exit(1)
    }
    console.log(
      `  ▶ Resume from page ${state.last_processed_page + 1} (already processed: ${state.processed_pages}, run_id=${state.run_id ?? '<dry-run-prev>'})`,
    )
  } else {
    state = {
      version: 1,
      filters: FILTERS,
      base_path: flags.basePath,
      limit: LIMIT,
      run_id: null,
      started_at: new Date().toISOString(),
      last_processed_page: -1,
      processed_pages: 0,
      inserted_count: 0,
      updated_count: 0,
      skipped_count: 0,
      api_calls_count: 0,
    }
    console.log('  ▶ Fresh run')
  }

  const supabase =
    flags.dryRun || !supaKey
      ? null
      : createSupabaseClient(SUPABASE_URL, supaKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })

  // ── Head fetch (page 0) — daje totalPages, też reuse якщо startPage==0 ──
  console.log('\n  Fetching head (page 0) to determine total pages...')
  const headStart = Date.now()
  const head: KrsSearchResponse = await searchOrganizations(
    krsKey,
    FILTERS,
    0,
    LIMIT,
    flags.basePath,
  )
  state.api_calls_count += 1

  const totalCount = Number(head.liczba_wszystkich_wynikow ?? head.wyniki?.length ?? 0)
  // Computed pages — rejestr.io не повертає `pages`; Math.ceil(total / LIMIT).
  const totalPages = Math.max(1, Math.ceil(totalCount / LIMIT))
  console.log(
    `  ✓ count=${totalCount}, totalPages=${totalPages}, head fetched in ${fmtDuration(Date.now() - headStart)}`,
  )

  // ── Insert sync_run row (live run, not resume, not dry-run) ──
  if (!flags.dryRun && supabase && !state.run_id) {
    const { data, error } = await supabase
      .from('ceidg_sync_runs')
      .insert({
        status: 'running',
        // Reuse ceidg_sync_runs table per migration 014 — JSONB filters
        // pole tolerantne do extra ключів. source='krs' розрізняє runs.
        filters: { source: 'krs', base_path: flags.basePath, ...FILTERS },
        total_pages: totalPages,
        started_at: state.started_at,
      })
      .select('id')
      .single()
    if (error || !data) {
      console.error('❌ Failed to insert ceidg_sync_runs row:', error?.message)
      process.exit(1)
    }
    state.run_id = data.id as string
    await saveState(state)
    console.log(`  ✓ ceidg_sync_runs row created: ${state.run_id}`)
  } else if (!flags.dryRun && supabase && state.run_id) {
    await supabase
      .from('ceidg_sync_runs')
      .update({ total_pages: totalPages })
      .eq('id', state.run_id)
  }

  // ── Determine page range ──
  const startPage = state.last_processed_page + 1
  const endPageExclusive =
    flags.maxPages !== null
      ? Math.min(totalPages, startPage + flags.maxPages)
      : totalPages

  if (startPage >= endPageExclusive) {
    console.log(
      `\n  ✓ Nothing to process (startPage=${startPage}, endExcl=${endPageExclusive})`,
    )
    if (!flags.dryRun && supabase && state.run_id && startPage >= totalPages) {
      await supabase
        .from('ceidg_sync_runs')
        .update({ status: 'completed', finished_at: new Date().toISOString() })
        .eq('id', state.run_id)
    }
    return
  }

  console.log(
    `\n  Processing pages ${startPage}..${endPageExclusive - 1} (${endPageExclusive - startPage} pages this invocation)\n`,
  )

  const sessionStart = Date.now()
  let sessionPages = 0

  try {
    for (let page = startPage; page < endPageExclusive; page += 1) {
      const pageStart = Date.now()

      // Reuse head data для page=0 — заощаджує 0.05 zł.
      let list: KrsSearchResponse
      if (page === 0) {
        list = head
      } else {
        list = await searchOrganizations(
          krsKey,
          FILTERS,
          page,
          LIMIT,
          flags.basePath,
        )
        state.api_calls_count += 1
      }

      const orgs = list.wyniki ?? []
      if (orgs.length === 0) {
        console.log(`  page ${page}/${totalPages - 1}: empty, advancing`)
        state.last_processed_page = page
        state.processed_pages += 1
        if (!flags.dryRun) await saveState(state)
        continue
      }

      const records = orgs.map(mapToInsert)
      let pageInserted = 0
      let pageUpdated = 0
      const pageSkipped = 0

      if (flags.dryRun) {
        console.log(
          `  page ${page}/${totalPages - 1}: [DRY] ${records.length} records`,
        )
        for (const [idx, r] of records.slice(0, 2).entries()) {
          console.log(`    --- record[${idx}] ---`)
          console.log(JSON.stringify(r, null, 2))
        }
        if (records.length > 2) {
          console.log(`    ... ${records.length - 2} more records (omitted in dry-run)`)
        }
      } else if (supabase) {
        // Pre-check existing krs_numbers для accurate inserted vs updated count.
        // Pre-check existing krs_numbers — реалізує counter accuracy
        // AND routing для loop UPDATE/INSERT (per-row partial unique fix
        // 2026-05-04 — Supabase JS .upsert() не сумісний з partial unique
        // index ceidg_prospects_krs_number_uniq бо Postgres вимагає
        // matching WHERE clause у ON CONFLICT spec для partial index).
        const krsNumbers = records
          .map((r) => r.krs_number)
          .filter((n): n is string => n !== null && n.length > 0)
        const existingByKrs = new Map<string, string>() // krs_number → id
        if (krsNumbers.length > 0) {
          const { data: existing, error: selErr } = await supabase
            .from('ceidg_prospects')
            .select('id, krs_number')
            .in('krs_number', krsNumbers)
          if (selErr) {
            throw new Error(`SELECT pre-check failed: ${selErr.message}`)
          }
          for (const row of existing ?? []) {
            const krs = (row as { krs_number: string | null }).krs_number
            const rowId = (row as { id: string }).id
            if (krs) existingByKrs.set(krs, rowId)
          }
          pageUpdated = records.filter(
            (r) => r.krs_number !== null && existingByKrs.has(r.krs_number),
          ).length
          pageInserted = records.length - pageUpdated
        } else {
          // Records без krs_number — будуть insert (no conflict possible)
          pageInserted = records.length
        }

        // Loop INSERT/UPDATE per record (replaces failing .upsert() з
        // partial unique index, per Vadym fix 2026-05-04). PK-based UPDATE
        // (.eq('id', ...)) bullet-proof; mapping fra batch SELECT.
        for (const record of records) {
          const payload = {
            ...record,
            last_synced_at: new Date().toISOString(),
          }
          const existingId = record.krs_number
            ? existingByKrs.get(record.krs_number)
            : undefined

          if (existingId) {
            const { error: updateErr } = await supabase
              .from('ceidg_prospects')
              .update(payload)
              .eq('id', existingId)
            if (updateErr) {
              if (isMigration055NotApplied(updateErr)) bailOnMigration055()
              if (isMigration056NotApplied(updateErr)) bailOnMigration056()
              throw new Error(
                `UPDATE failed (krs ${record.krs_number}): ${updateErr.message}`,
              )
            }
          } else {
            const { error: insertErr } = await supabase
              .from('ceidg_prospects')
              .insert(payload)
            if (insertErr) {
              if (isMigration055NotApplied(insertErr)) bailOnMigration055()
              if (isMigration056NotApplied(insertErr)) bailOnMigration056()
              throw new Error(
                `INSERT failed (krs ${record.krs_number ?? 'no-krs'}): ${insertErr.message}`,
              )
            }
          }
        }
      }

      // Update state
      state.last_processed_page = page
      state.processed_pages += 1
      state.inserted_count += pageInserted
      state.updated_count += pageUpdated
      state.skipped_count += pageSkipped
      sessionPages += 1

      // Telemetria
      if (!flags.dryRun && supabase && state.run_id) {
        await supabase
          .from('ceidg_sync_runs')
          .update({
            processed_pages: state.processed_pages,
            inserted_count: state.inserted_count,
            updated_count: state.updated_count,
            skipped_count: state.skipped_count,
            api_calls_count: state.api_calls_count,
          })
          .eq('id', state.run_id)
      }

      if (!flags.dryRun) await saveState(state)

      const pageDuration = Date.now() - pageStart
      const remaining = endPageExclusive - page - 1
      const avgPageMs = (Date.now() - sessionStart) / sessionPages
      const etaMs = remaining * avgPageMs
      const summary = flags.dryRun
        ? '[DRY]'
        : `+${pageInserted} new, +${pageUpdated} upd`
      console.log(
        `  page ${page}/${totalPages - 1}: ${summary}, ${orgs.length} orgs, ${fmtDuration(pageDuration)}${remaining > 0 ? ` (ETA ${fmtDuration(etaMs)})` : ''}`,
      )
    }

    // Mark completed якщо reached end
    const fullyDone = state.last_processed_page >= totalPages - 1
    if (fullyDone && !flags.dryRun && supabase && state.run_id) {
      await supabase
        .from('ceidg_sync_runs')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
        })
        .eq('id', state.run_id)
    }
    console.log(
      fullyDone
        ? '\n✅ Sync COMPLETED.'
        : '\n✓ Batch done (not full sync). Re-run to continue from next page.',
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(
      `\n❌ FAILED at page ${state.last_processed_page + 1}: ${message}`,
    )
    if (!flags.dryRun && supabase && state.run_id) {
      await supabase
        .from('ceidg_sync_runs')
        .update({
          status: /429/.test(message) ? 'rate_limited' : 'failed',
          error_message: message.slice(0, 1000),
          finished_at: new Date().toISOString(),
        })
        .eq('id', state.run_id)
    }
    process.exit(1)
  }

  // ── Final summary ──
  console.log('\n══════ Summary (this invocation) ══════')
  console.log(`  pages this session:  ${sessionPages}`)
  console.log(`  cumulative pages:    ${state.processed_pages}`)
  console.log(`  cumulative inserted: ${state.inserted_count}`)
  console.log(`  cumulative updated:  ${state.updated_count}`)
  console.log(`  cumulative API calls:${state.api_calls_count}`)
  console.log(`  est. cost:           ~${(state.api_calls_count * 0.05).toFixed(2)} zł`)
  console.log(`  session duration:    ${fmtDuration(Date.now() - sessionStart)}`)
  if (state.run_id) console.log(`  ceidg_sync_runs.id:  ${state.run_id}`)
}

main().catch((err) => {
  console.error('\n❌ KRS bootstrap crashed:', err)
  process.exit(1)
})
