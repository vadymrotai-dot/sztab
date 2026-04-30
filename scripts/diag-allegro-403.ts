// scripts/diag-allegro-403.ts
// READ-ONLY diagnose: probe Allegro API endpoints to determine root cause
// of 403 на /offers/listing.
//
// Reads allegro_client_id / allegro_client_secret з params via management
// API. NEVER prints secret values nor minted tokens. Only status codes
// + presence booleans + lengths.

import '@/lib/env'
import { executeManagementSQL } from '@/lib/supabase/management'

const TOKEN_URL = 'https://allegro.pl/auth/oauth/token'
const API_BASE = 'https://api.allegro.pl'
const ACCEPT_HEADER = 'application/vnd.allegro.public.v1+json'

async function getCreds(): Promise<{ id: string; secret: string }> {
  const r = await executeManagementSQL(
    `SELECT allegro_client_id, allegro_client_secret FROM params WHERE allegro_client_id IS NOT NULL LIMIT 1;`,
  )
  const row = (r.rows ?? [])[0] as
    | { allegro_client_id: string; allegro_client_secret: string }
    | undefined
  if (!row?.allegro_client_id || !row?.allegro_client_secret) {
    throw new Error('No Allegro creds in params')
  }
  console.log(
    `creds loaded: id_len=${row.allegro_client_id.length} secret_len=${row.allegro_client_secret.length}`,
  )
  return { id: row.allegro_client_id, secret: row.allegro_client_secret }
}

async function mintToken(id: string, secret: string): Promise<string> {
  const basic = Buffer.from(`${id}:${secret}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  console.log(`token POST status: ${res.status}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const safe = text.slice(0, 200).replace(/[a-zA-Z0-9._-]{20,}/g, '<redacted>')
    throw new Error(`token mint failed: ${safe}`)
  }
  const json = (await res.json()) as {
    access_token?: string
    expires_in?: number
    scope?: string
    token_type?: string
  }
  if (!json.access_token) throw new Error('no access_token in response')
  console.log(
    `token minted: expires_in=${json.expires_in} token_type=${json.token_type ?? '?'} scope=${json.scope ?? '<empty>'} access_token_len=${json.access_token.length}`,
  )
  return json.access_token
}

async function probe(label: string, url: string, token: string) {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: ACCEPT_HEADER,
    },
  })
  let detail = ''
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const safe = text
      .slice(0, 400)
      .replace(/[a-zA-Z0-9._-]{20,}/g, '<redacted>')
    detail = ` body=${safe}`
  } else {
    const text = await res.text().catch(() => '')
    detail = ` body_len=${text.length}`
  }
  console.log(`${label}: HTTP ${res.status}${detail}`)
}

async function main() {
  const { id, secret } = await getCreds()
  const token = await mintToken(id, secret)

  console.log('\n--- probes ---')
  await probe(
    '/offers/listing (PUBLIC search)',
    `${API_BASE}/offers/listing?phrase=coca-cola&limit=5`,
    token,
  )
  await probe(
    '/sale/categories (PUBLIC sanity)',
    `${API_BASE}/sale/categories`,
    token,
  )
  await probe(
    '/sale/offers (OWN seller offers)',
    `${API_BASE}/sale/offers?limit=5`,
    token,
  )
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
