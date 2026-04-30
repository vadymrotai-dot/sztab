import 'server-only'

// lib/allegro/client.ts
// Sprint S3 main — server-only Allegro REST API client.
// OAuth client_credentials flow з token caching у params table per
// owner_id. Reads creds via Supabase server client (cookies-based session).
//
// Functions:
//   getAllegroToken() — returns valid access_token (cached or fresh).
//   searchOffers(phrase, opts) — wraps GET /offers/listing.
//
// Security:
//   - NEVER logs client_secret, access_token чи raw OAuth response body.
//   - Errors thrown contain status + safe text snippet only (no creds).
//   - Server-only enforcement via 'server-only' import.

import { createClient } from '@/lib/supabase/server'
import type {
  AllegroTokenResponse,
  AllegroOfferListingResponse,
  SearchOffersOptions,
} from './types'

const TOKEN_URL = 'https://allegro.pl/auth/oauth/token'
const API_BASE = 'https://api.allegro.pl'
const ACCEPT_HEADER = 'application/vnd.allegro.public.v1+json'
const REFRESH_BUFFER_MS = 60_000 // refresh 1 min przed expiry

interface ParamsRow {
  allegro_client_id: string | null
  allegro_client_secret: string | null
  allegro_access_token: string | null
  allegro_token_expires_at: string | null
}

/**
 * Get a valid Allegro OAuth access token. Uses cached token if not expired
 * (з REFRESH_BUFFER_MS safety margin), otherwise mints fresh via
 * client_credentials grant и persists у params for the current user.
 *
 * Throws coли:
 *   - No authenticated session
 *   - Allegro creds nie ustawione у /settings
 *   - OAuth endpoint returns non-2xx
 */
export async function getAllegroToken(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Allegro: brak sesji użytkownika.')
  }

  const { data, error } = await supabase
    .from('params')
    .select(
      'allegro_client_id, allegro_client_secret, allegro_access_token, allegro_token_expires_at',
    )
    .eq('owner_id', user.id)
    .maybeSingle()
  if (error) {
    throw new Error(`Allegro: nie można odczytać params (${error.message})`)
  }
  const row = (data ?? {}) as ParamsRow

  if (!row.allegro_client_id || !row.allegro_client_secret) {
    throw new Error(
      'Allegro credentials not configured. Set in /settings → Klucze API.',
    )
  }

  // Cache hit?
  if (row.allegro_access_token && row.allegro_token_expires_at) {
    const expiresAt = new Date(row.allegro_token_expires_at).getTime()
    if (expiresAt > Date.now() + REFRESH_BUFFER_MS) {
      return row.allegro_access_token
    }
  }

  // Mint fresh token via client_credentials.
  const basic =
    typeof Buffer !== 'undefined'
      ? Buffer.from(`${row.allegro_client_id}:${row.allegro_client_secret}`).toString(
          'base64',
        )
      : btoa(`${row.allegro_client_id}:${row.allegro_client_secret}`)

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    // Strip any echoed credentials from bodyText (defensive).
    const safe = bodyText.slice(0, 200).replace(/[a-zA-Z0-9._-]{20,}/g, '<redacted>')
    throw new Error(`Allegro token HTTP ${res.status}: ${safe}`)
  }

  const json = (await res.json()) as AllegroTokenResponse
  if (!json.access_token || typeof json.expires_in !== 'number') {
    throw new Error('Allegro token: malformed response')
  }

  const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString()
  const { error: updErr } = await supabase
    .from('params')
    .update({
      allegro_access_token: json.access_token,
      allegro_token_expires_at: expiresAt,
    })
    .eq('owner_id', user.id)
  if (updErr) {
    // Token still usable for current request even if cache write fails;
    // log без token value
    console.warn(`Allegro: cache write failed (${updErr.message})`)
  }

  return json.access_token
}

/**
 * Search Allegro offers (GET /offers/listing).
 *
 * Wraps token retrieval + listing call. Returns parsed response —
 * caller decides how to merge promoted/regular items.
 *
 * @throws коли HTTP non-2xx or token retrieval fails.
 */
export async function searchOffers(
  phrase: string,
  opts: SearchOffersOptions = {},
): Promise<AllegroOfferListingResponse> {
  const token = await getAllegroToken()

  const limit = Math.min(60, Math.max(1, opts.limit ?? 24))
  const offset = Math.max(0, opts.offset ?? 0)

  const params = new URLSearchParams({
    phrase,
    limit: String(limit),
    offset: String(offset),
  })
  if (opts.category) params.set('category.id', opts.category)
  if (opts.sort) params.set('sort', opts.sort)

  const url = `${API_BASE}/offers/listing?${params.toString()}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: ACCEPT_HEADER,
    },
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    const safe = bodyText.slice(0, 300).replace(/[a-zA-Z0-9._-]{20,}/g, '<redacted>')
    throw new Error(`Allegro searchOffers HTTP ${res.status}: ${safe}`)
  }

  return (await res.json()) as AllegroOfferListingResponse
}
