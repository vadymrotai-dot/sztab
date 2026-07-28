// scripts/vat-backfill.ts
// VAT backfill — бере записи з fba_prospects де vat_checked_at IS NULL,
// перевіряє через Białą Listę MF (api/search/nips), оновлює vat_status,
// vat_account_numbers, vat_checked_at.
//
// Запуск: npx tsx scripts/vat-backfill.ts
// Ліміт MF API: ~3500 NIP/день на IP. Пауза 3s між батчами (30 NIP/батч).
// При 429 — скрипт зупиняється, треба запустити наступного дня.

import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN!

const TODAY = new Date().toISOString().slice(0, 10)
const NOW = new Date().toISOString()
const BATCH_SIZE = 30
const PAUSE_MS = 3_000

function curlGet(url: string, headers: string[]): string {
  const args = ['curl', '-s', url, ...headers.flatMap(h => ['-H', h])]
  return execSync(args.join(' '), { timeout: 30_000 }).toString()
}

function curlPost(url: string, body: string, headers: string[]): string {
  const escaped = body.replace(/'/g, `'\\''`)
  const args = `curl -s -X POST '${url}' ${headers.map(h => `-H '${h}'`).join(' ')} -d '${escaped}'`
  return execSync(args, { timeout: 30_000 }).toString()
}

function supaGet(path: string): unknown[] {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const raw = curlGet(url, [
    `Authorization: Bearer ${SUPABASE_SERVICE_KEY}`,
    `apikey: ${SUPABASE_ANON_KEY}`,
  ])
  return JSON.parse(raw) as unknown[]
}

function supaSQL(sql: string): void {
  const body = JSON.stringify({ query: sql })
  curlPost(
    'https://api.supabase.com/v1/projects/pxovjyxsktxdbovmybxz/database/query',
    body,
    [`Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}`, 'Content-Type: application/json'],
  )
}

interface MfEntry {
  identifier: number
  subjects: { statusVat?: string; accountNumbers?: string[] }[]
}

function mfBatch(nips: string[]): Map<string, { status: string; accounts: string[] }> {
  const url = `https://wl-api.mf.gov.pl/api/search/nips/${nips.join(',')}?date=${TODAY}`
  const raw = execSync(`curl -s -w '\\nHTTP:%{http_code}' '${url}'`, { timeout: 30_000 }).toString()
  const parts = raw.split('\nHTTP:')
  const httpStatus = parts[parts.length - 1].trim()
  if (httpStatus === '429') throw new Error('RATE_LIMIT_429')
  if (httpStatus !== '200') throw new Error(`MF HTTP ${httpStatus}`)

  const data = JSON.parse(parts[0]) as { result?: { entries?: MfEntry[] } }
  const entries = data.result?.entries ?? []
  const out = new Map<string, { status: string; accounts: string[] }>()
  for (const e of entries) {
    const nip = String(e.identifier)
    const subj = e.subjects?.[0] ?? {}
    out.set(nip, {
      status: subj.statusVat ?? 'Niezarejestrowany',
      accounts: subj.accountNumbers ?? [],
    })
  }
  return out
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log('=== VAT Backfill ===')
  console.log(`Data: ${TODAY}`)

  // Завантажити всі записи де vat_checked_at IS NULL
  let allRecords: { id: string; nip: string }[] = []
  let offset = 0
  while (true) {
    const batch = supaGet(
      `fba_prospects?select=id,nip&nip=not.is.null&vat_checked_at=is.null&limit=1000&offset=${offset}`,
    ) as { id: string; nip: string }[]
    if (batch.length === 0) break
    allRecords = allRecords.concat(batch)
    offset += batch.length
    if (batch.length < 1000) break
  }

  const total = allRecords.length
  console.log(`Записів для перевірки: ${total}`)
  if (total === 0) {
    console.log('Всі записи вже перевірені!')
    return
  }

  let ok = 0
  let errCount = 0

  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const chunk = allRecords.slice(i, i + BATCH_SIZE)
    const nips = chunk.map(r => r.nip)
    const idMap = new Map(chunk.map(r => [r.nip, r.id]))
    const batchNum = Math.floor(i / BATCH_SIZE) + 1

    try {
      const results = mfBatch(nips)

      // Будуємо VALUES для bulk UPDATE
      const vals: string[] = []
      for (const nip of nips) {
        const id = idMap.get(nip)
        if (!id) continue
        const r = results.get(nip) ?? { status: 'Niezarejestrowany', accounts: [] }
        const accs = r.accounts.length > 0
          ? `ARRAY[${r.accounts.map(a => `'${a}'`).join(',')}]::text[]`
          : 'NULL'
        vals.push(`('${id}', '${r.status}', ${accs})`)
      }

      const sql = `
        UPDATE fba_prospects
        SET vat_status = v.s,
            vat_account_numbers = v.a,
            vat_checked_at = '${NOW}'
        FROM (VALUES ${vals.join(', ')}) AS v(i, s, a)
        WHERE fba_prospects.id = v.i::uuid;
      `
      supaSQL(sql)
      ok += chunk.length

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
      console.log(`  batch ${batchNum}: ${chunk.length} OK | total: ${ok}/${total} | ${elapsed}s`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'RATE_LIMIT_429') {
        console.error(`\n[429] Денний ліміт MF API вичерпано. Оброблено: ${ok}/${total}. Запусти завтра.`)
        process.exit(1)
      }
      errCount += chunk.length
      console.warn(`  batch ${batchNum} ERR: ${msg}`)
    }

    if (i + BATCH_SIZE < allRecords.length) {
      await sleep(PAUSE_MS)
    }
  }

  console.log(`\n=== ГОТОВО: ${ok} оновлено, ${errCount} помилок з ${total} ===`)
}

const startTime = Date.now()
main().catch(e => { console.error('Fatal:', e); process.exit(1) })
