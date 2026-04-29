// scripts/sprint-m-rejestrio-probe.ts
// Sprint M FIX 8 — verify rejestr.io v2 endpoint shapes against real API.

import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

const KOZAK_NIP = '7561993172'
const KOZAK_KRS = '0000977768'

async function getApiKey(): Promise<string> {
  const r = await executeManagementSQL(
    `SELECT krs_rejestr_api_token FROM params LIMIT 1;`,
  )
  const row = r.rows?.[0] as { krs_rejestr_api_token?: string } | undefined
  if (!row?.krs_rejestr_api_token) throw new Error('krs_rejestr_api_token missing in params')
  return row.krs_rejestr_api_token
}

async function probe(label: string, url: string, apiKey: string) {
  console.log(`\n━━━ ${label} ━━━`)
  console.log(`GET ${url}`)
  try {
    const res = await fetch(url, {
      headers: { Authorization: apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    console.log(`HTTP ${res.status}`)
    console.log(text.slice(0, 1500))
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : err}`)
  }
}

async function main() {
  const key = await getApiKey()
  console.log(`Using API key (last 4): ...${key.slice(-4)}`)

  await probe('1. Konto / stan', 'https://rejestr.io/api/v2/konto/stan', key)
  await probe('2. /org by NIP', `https://rejestr.io/api/v2/org?nip=${KOZAK_NIP}`, key)
  await probe('3. /org by KRS', `https://rejestr.io/api/v2/org?krs=${KOZAK_KRS}`, key)
  await probe('4. /krs by KRS number', `https://rejestr.io/api/v2/krs/${KOZAK_KRS}`, key)
  await probe('5. /podmioty by NIP', `https://rejestr.io/api/v2/podmioty?nip=${KOZAK_NIP}`, key)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
