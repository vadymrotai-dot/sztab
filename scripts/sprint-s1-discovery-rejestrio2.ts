// Sprint S1 Phase 0 — second pass: doc detail (XBRL JSON) + osoba endpoints.

import '@/lib/env'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { executeManagementSQL } from '@/lib/supabase/management'

const KRS = '0000977768'
const REJESTR_BASE = 'https://rejestr.io/api/v2'
// IDs discovered у first pass:
const DOC_ID_BILANS_2024 = 17708357 // czy_ma_json: true
const DOC_ID_RZIS_2024 = 17708354 // czy_ma_json: true
const PERSON_ID_PREZES = 3008026

async function getApiKey(): Promise<string> {
  const r = await executeManagementSQL(
    `SELECT krs_rejestr_api_token FROM params LIMIT 1;`,
  )
  return ((r.rows?.[0] as { krs_rejestr_api_token: string }).krs_rejestr_api_token)
}

async function probe(name: string, url: string, apiKey: string) {
  const filename = `rejestrio-${name}.json`
  const res = await fetch(url, {
    headers: { Authorization: apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  await fs.writeFile(
    path.join('tmp/api-discovery', filename),
    JSON.stringify({ url, status: res.status, body }, null, 2),
  )
  console.log(`${res.ok ? '✅' : '❌'} ${name.padEnd(40)} HTTP ${res.status}`)
  return { ok: res.ok, status: res.status, body }
}

async function main() {
  const apiKey = await getApiKey()
  console.log(`Probing additional rejestr.io v2 endpoints\n`)

  await probe(
    '07a-doc-bilans-2024',
    `${REJESTR_BASE}/org/${KRS}/krs-dokumenty/${DOC_ID_BILANS_2024}?format=json`,
    apiKey,
  )
  await probe(
    '07b-doc-rzis-2024',
    `${REJESTR_BASE}/org/${KRS}/krs-dokumenty/${DOC_ID_RZIS_2024}?format=json`,
    apiKey,
  )
  await probe(
    '09-osoba-detail',
    `${REJESTR_BASE}/osoby/${PERSON_ID_PREZES}`,
    apiKey,
  )
  await probe(
    '10-osoba-powiazania',
    `${REJESTR_BASE}/osoby/${PERSON_ID_PREZES}/krs-powiazania?aktualnosc=aktualne`,
    apiKey,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
