// scripts/sync-ceidg-bootstrap.ts
// Phase 2.6 Step 2: off-platform bootstrap CEIDG sync.
//
// Prereq: .env.local with CEIDG_API_KEY + SUPABASE_SERVICE_ROLE_KEY
// (run setup-env.ts).
//
// Strategy A (Vadym): limit=25 + resumable + leave overnight.
// Fixed scope (validation run): pkd=5610A × wojewodztwo=mazowieckie × status=AKTYWNY.
//
// Per-page flow: list (25 firms, ~57s) + 25 detail calls (~5s + rate
// limiter) → upsert do ceidg_prospects (1 SELECT pre-check + 1 UPSERT).
// Detail call enriches z pkd[] / pkdGlowny / adresKorespondencyjny —
// nie ma w list response, krytyczne dla scoring engine (Promt 3).
//
// State: .ceidg-progress.json (gitignored). Crash-safe — re-run podejmuje
// od last_processed_page+1. Telemetria w ceidg_sync_runs (jeden run row
// per sync session, update co page).
//
// Run:
//   $env:CEIDG_API_KEY="<jwt>"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<key>"     # required unless --dry-run
//   pnpm dlx tsx scripts/sync-ceidg-bootstrap.ts [--dry-run] [--max-pages=N] [--reset]
//
// Flags:
//   --dry-run         skip DB writes (no upsert, no sync_run row, no state save)
//   --max-pages=N     stop after N pages (counts within current invocation)
//   --reset           delete state file before start (fresh run)

import '@/lib/env'

import fs from 'node:fs/promises'
import path from 'node:path'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { CeidgClient, HtmlResponseError } from '@/lib/ceidg/client'
import type {
  CeidgFilters,
  CeidgFirmaDetails,
  CeidgListItem,
  CeidgListResponse,
  ProspectInsert,
} from '@/lib/ceidg/types'

// ────────────────────────────────────────────────────────────
// Config — fixed per Vadym's instruction
// ────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'
const STATE_FILE = path.resolve(process.cwd(), '.ceidg-progress.json')
const STATE_TMP = STATE_FILE + '.tmp'

const PKD_WAVE_1 = [
  '6201Z', // programisci (PKD 2007)
  '6202Z', // IT konsultanci (PKD 2007)
  '6220B', // IT konsultanci (PKD 2025)
  '7410Z', // design (PKD 2007)
  '7411Z', // design graficzny (PKD 2025)
  '7412Z', // design komunikacja wizualna (PKD 2025)
  '7420Z', // fotografowie
  '7311Z', // marketing/SMM
]
const CURRENT_PKD = process.env.CEIDG_PKD ?? PKD_WAVE_1[0]
const FILTERS: CeidgFilters = {
  pkd: CURRENT_PKD,
  wojewodztwo: 'mazowieckie',
  status: 'AKTYWNY',
}
const LIMIT = 25

// ────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────

interface CliFlags {
  dryRun: boolean
  maxPages: number | null
  reset: boolean
}

function parseCli(): CliFlags {
  const args = process.argv.slice(2)
  let dryRun = false
  let maxPages: number | null = null
  let reset = false
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
    } else {
      console.error(`❌ Unknown arg: ${arg}`)
      process.exit(1)
    }
  }
  return { dryRun, maxPages, reset }
}

// ────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────

interface ProgressState {
  version: 1
  filters: CeidgFilters
  limit: number
  run_id: string | null              // null in dry-run
  started_at: string                  // ISO — first invocation start
  last_processed_page: number         // -1 if none done yet
  processed_pages: number             // cumulative across resumes
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
  // Atomic: write to .tmp, rename. Crash mid-write nie korumpuje pliku.
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
// Mappers — CEIDG → DB row
// ────────────────────────────────────────────────────────────

function buildFullAddress(adr: CeidgListItem['adresDzialalnosci']): string | null {
  const parts: string[] = []
  if (adr.ulica) {
    let line = adr.ulica
    if (adr.budynek) line += ' ' + adr.budynek
    if (adr.lokal) line += '/' + adr.lokal
    parts.push(line)
  }
  if (adr.kod) parts.push(adr.kod)
  if (adr.miasto) parts.push(adr.miasto)
  return parts.length > 0 ? parts.join(', ') : null
}

// -- FBA helpers --
function calcZusSegment(dataRozpoczecia: string | null): string {
  if (!dataRozpoczecia) return 'UNKNOWN'
  if (dataRozpoczecia < '2023-01-01') return 'PELNY'
  if (dataRozpoczecia < '2025-01-01') return 'MALY'
  return 'ULGA'
}
function calcObywatelstwo(raw: unknown): string | null {
  try {
    const d = raw as Record<string, unknown>
    // raw.obywatelstwa = [{kraj: 'Białoruś', symbol: 'BY'}, ...]
    const val = d?.obywatelstwa
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0] as Record<string, unknown>
      const symbol = first?.symbol
      if (typeof symbol === 'string') return symbol.toUpperCase()
    }
    return null
  } catch {
    return null
  }
}
function detailToInsert(d: CeidgFirmaDetails): ProspectInsert {
  const ownerName = `${d.wlasciciel.imie ?? ''} ${d.wlasciciel.nazwisko ?? ''}`.trim()
  return {
    ceidg_id: d.id,
    nip: d.wlasciciel.nip ?? null,
    regon: d.wlasciciel.regon ?? null,
    name: d.nazwa,
    owner_name: ownerName.length > 0 ? ownerName : null,
    status: d.status,
    pkd_main: d.pkdGlowny?.kod ?? null,
    pkd_all: d.pkd?.map((p) => p.kod) ?? null,
    wojewodztwo: d.adresDzialalnosci.wojewodztwo ?? null,
    powiat: d.adresDzialalnosci.powiat ?? null,
    gmina: d.adresDzialalnosci.gmina ?? null,
    miejscowosc: d.adresDzialalnosci.miasto ?? null,
    kod_pocztowy: d.adresDzialalnosci.kod ?? null,
    ulica: d.adresDzialalnosci.ulica ?? null,
    budynek: d.adresDzialalnosci.budynek ?? null,
    lokal: d.adresDzialalnosci.lokal ?? null,
    adres_full: buildFullAddress(d.adresDzialalnosci),
    data_rozpoczecia: d.dataRozpoczecia ?? null,
    // Contact — CEIDG zwraca dla części firm (probe 2026-04-27 potwierdził).
    // Schema już ma email/telefon/www NULLable; www pomijamy bo brak w probe.
    email: d.email ?? null,
    telefon: d.telefon ?? null,
    raw_data: d,
  }
}

// Fallback gdy detail endpoint zwrócił null (404 — usunięta firma między
// list a detail, albo retry-exhaust). Tracimy pkd_all i adresKoresp,
// zachowujemy minimum z list.
function listToInsert(item: CeidgListItem): ProspectInsert {
  const ownerName = `${item.wlasciciel.imie ?? ''} ${item.wlasciciel.nazwisko ?? ''}`.trim()
  return {
    ceidg_id: item.id,
    nip: item.wlasciciel.nip ?? null,
    regon: item.wlasciciel.regon ?? null,
    name: item.nazwa,
    owner_name: ownerName.length > 0 ? ownerName : null,
    status: item.status,
    pkd_main: null,
    pkd_all: null,
    wojewodztwo: item.adresDzialalnosci.wojewodztwo ?? null,
    powiat: item.adresDzialalnosci.powiat ?? null,
    gmina: item.adresDzialalnosci.gmina ?? null,
    miejscowosc: item.adresDzialalnosci.miasto ?? null,
    kod_pocztowy: item.adresDzialalnosci.kod ?? null,
    ulica: item.adresDzialalnosci.ulica ?? null,
    budynek: item.adresDzialalnosci.budynek ?? null,
    lokal: item.adresDzialalnosci.lokal ?? null,
    adres_full: buildFullAddress(item.adresDzialalnosci),
    data_rozpoczecia: item.dataRozpoczecia ?? null,
    // List response nie zawiera email/telefon — null. Detail-fallback fires
    // tylko gdy detail call zwrócił 404, więc rzadkie.
    email: null,
    telefon: null,
    raw_data: item,
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

function parseTotalPages(response: CeidgListResponse): number {
  try {
    const url = new URL(response.links.last)
    const p = url.searchParams.get('page')
    if (p !== null) return Number.parseInt(p, 10) + 1
  } catch {
    // ignore
  }
  return Math.max(1, Math.ceil(response.count / LIMIT))
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────

async function main() {
  const flags = parseCli()
  const ceidgKey = process.env.CEIDG_API_KEY
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!ceidgKey) {
    console.error('❌ Brak CEIDG_API_KEY w env')
    process.exit(1)
  }
  if (!flags.dryRun && !supaKey) {
    console.error(
      '❌ Brak SUPABASE_SERVICE_ROLE_KEY w env (wymagany unless --dry-run)',
    )
    process.exit(1)
  }

  console.log('\n══════ CEIDG bootstrap sync ══════')
  console.log('  filters:    ', JSON.stringify(FILTERS))
  console.log('  limit:      ', LIMIT)
  console.log('  dry-run:    ', flags.dryRun)
  console.log('  max-pages:  ', flags.maxPages ?? '∞')
  console.log('  state file: ', STATE_FILE)
  console.log()

  if (flags.reset) {
    await deleteState()
    console.log('  ↺ state reset (deleted .ceidg-progress.json)\n')
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
    console.log(
      `  ▶ Resume from page ${state.last_processed_page + 1} (already processed: ${state.processed_pages}, run_id=${state.run_id ?? '<dry-run-prev>'})`,
    )
  } else {
    state = {
      version: 1,
      filters: FILTERS,
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

  const ceidg = new CeidgClient(ceidgKey)
  const supabase =
    flags.dryRun || !supaKey
      ? null
      : createSupabaseClient(SUPABASE_URL, supaKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })

  // ── Head fetch (page 0) — daje count + totalPages, też reuse jeśli startPage==0 ──
  console.log('\n  Fetching head (page 0) to determine total pages...')
  const headStart = Date.now()
  const head = await ceidg.listFirms(FILTERS, 0, LIMIT)
  state.api_calls_count += 1
  const totalPages = parseTotalPages(head)
  console.log(
    `  ✓ count=${head.count}, totalPages=${totalPages}, head fetched in ${fmtDuration(Date.now() - headStart)}`,
  )

  // ── Insert sync_run row (live run, not resume, not dry-run) ──
  if (!flags.dryRun && supabase && !state.run_id) {
    const { data, error } = await supabase
      .from('ceidg_sync_runs')
      .insert({
        status: 'running',
        filters: FILTERS,
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
    // Resume: refresh total_pages w razie zmiany count między runs.
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
      // Per-page try/catch (Vadym 2026-05-04 HTML fallback fix).
      // HtmlResponseError → page skip + advance state + continue.
      // Інша помилка → re-throw до outer catch (existing fail logic).
      try {

      // Reuse head dla page=0 — zaoszczędza 1 call (50s+).
      let list: CeidgListResponse
      if (page === 0) {
        list = head
      } else {
        list = await ceidg.listFirms(FILTERS, page, LIMIT)
        state.api_calls_count += 1
      }

      const firms = list.firmy
      if (firms.length === 0) {
        console.log(`  page ${page}/${totalPages - 1}: empty, advancing`)
        state.last_processed_page = page
        state.processed_pages += 1
        if (!flags.dryRun) await saveState(state)
        continue
      }

      // Detail fetch dla każdej firmy → pełny pkd[] + adresKoresp.
      const records: ProspectInsert[] = []
      let detailMissCount = 0
      // LIST-ONLY режим: 1 запит на сторінку замість 26.
      // obywatelstwo = null для нових — заповнюється пізніше через SQL backfill.
      for (const firm of firms) {
        const insert = listToInsert(firm)
        insert.source_pkd = CURRENT_PKD
        insert.zus_segment = calcZusSegment(insert.data_rozpoczecia ?? null)
        insert.obywatelstwo = null
        records.push(insert)
      }

      let pageInserted = 0
      let pageUpdated = 0
      const pageSkipped = 0

      if (flags.dryRun) {
        console.log(
          `  page ${page}/${totalPages - 1}: [DRY] ${records.length} records, ${detailMissCount} detail misses`,
        )
        // Show first 2 records full structure dla validation
        for (const [idx, r] of records.slice(0, 2).entries()) {
          console.log(`    --- record[${idx}] ---`)
          console.log(JSON.stringify(r, null, 2))
        }
        if (records.length > 2) {
          console.log(`    ... ${records.length - 2} more records (omitted in dry-run)`)
        }
      } else if (supabase) {
        // Pre-check existing IDs dla accurate inserted vs updated count.
        const ids = records.map((r) => r.ceidg_id)
        const { data: existing, error: selErr } = await supabase
          .from('fba_prospects')
          .select('ceidg_id')
          .in('ceidg_id', ids)
        if (selErr) {
          throw new Error(`SELECT pre-check failed: ${selErr.message}`)
        }
        const existingSet = new Set(
          (existing ?? []).map((r) => r.ceidg_id as string),
        )
        pageUpdated = existingSet.size
        pageInserted = records.length - pageUpdated

        const upsertPayload = records.map((r) => ({
          ...r,
          last_synced_at: new Date().toISOString(),
        }))
        const { error: upErr } = await supabase
          .from('fba_prospects')
          .upsert(upsertPayload, {
            onConflict: 'ceidg_id',
            ignoreDuplicates: false,
          })
        if (upErr) {
          throw new Error(`UPSERT failed: ${upErr.message}`)
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
        : `+${pageInserted} new, +${pageUpdated} upd${detailMissCount > 0 ? `, ${detailMissCount} detail-miss` : ''}`
      console.log(
        `  page ${page}/${totalPages - 1}: ${summary}, ${firms.length} firms, ${fmtDuration(pageDuration)}${remaining > 0 ? ` (ETA ${fmtDuration(etaMs)})` : ''}`,
      )
      } catch (pageErr) {
        if (pageErr instanceof HtmlResponseError) {
          console.warn(
            `⚠ Page ${page} skipped — HTML response після 3 retries: ${pageErr.message}`,
          )
          state.last_processed_page = page
          state.processed_pages += 1
          state.skipped_count += 1
          if (!flags.dryRun) await saveState(state)
          continue
        }
        // Інша помилка — re-throw до outer catch (existing exit logic).
        throw pageErr
      }
    }

    // ── Mark completed jeśli reached end ──
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
  console.log(`  session duration:    ${fmtDuration(Date.now() - sessionStart)}`)
  if (state.run_id) console.log(`  ceidg_sync_runs.id:  ${state.run_id}`)
}

main().catch((err) => {
  console.error('\n❌ Bootstrap crashed:', err)
  process.exit(1)
})
