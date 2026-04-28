// lib/supabase/management.ts
// Wrapper for Supabase Management API. NEVER pass tokens via shell
// command-line — secrets traverse process.env (loaded from .env.local
// by dotenv/config) or DB, never tool-call args.
//
// Token resolution (preferred → fallback):
//   1. process.env.SUPABASE_ACCESS_TOKEN — set by .env.local (auto-loaded)
//   2. params.supabase_access_token — requires SUPABASE_SERVICE_ROLE_KEY
//      in env to read params row
//
// Returns QueryResult — never throws on HTTP errors (caller inspects .ok).
// Network/parse errors do throw.

import 'dotenv/config'

import { createClient } from '@supabase/supabase-js'

const MGMT_API_BASE = 'https://api.supabase.com/v1'
const PROJECT_REF = 'pxovjyxsktxdbovmybxz'
const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

export interface QueryResult {
  ok: boolean
  rows?: unknown[]
  error?: string
  status?: number
}

/**
 * Fetch Supabase Management API access token. Throws if not available
 * via either env or params. Token never logged.
 */
export async function getManagementToken(): Promise<string> {
  const envToken = process.env.SUPABASE_ACCESS_TOKEN
  if (envToken && envToken.startsWith('sbp_')) {
    return envToken
  }

  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supaKey) {
    throw new Error(
      'No SUPABASE_ACCESS_TOKEN env. Set SUPABASE_SERVICE_ROLE_KEY to fetch from params, ' +
        'or set SUPABASE_ACCESS_TOKEN directly (sbp_... prefix).',
    )
  }

  const supabase = createClient(SUPABASE_URL, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase
    .from('params')
    .select('supabase_access_token')
    .single()
  if (error) {
    throw new Error(`Failed to read params.supabase_access_token: ${error.message}`)
  }
  const token = (data as { supabase_access_token?: string | null } | null)
    ?.supabase_access_token
  if (!token) {
    throw new Error(
      'params.supabase_access_token is empty. Set it via Dashboard SQL Editor.',
    )
  }
  return token
}

/**
 * Execute arbitrary SQL via Supabase Management API. Supports DDL
 * (ALTER, CREATE) and DML (SELECT, INSERT, UPDATE, DELETE).
 *
 * Token is fetched via getManagementToken() — caller controls source
 * via env (SUPABASE_ACCESS_TOKEN preferred, or SUPABASE_SERVICE_ROLE_KEY
 * → params lookup as fallback).
 */
export async function executeManagementSQL(sql: string): Promise<QueryResult> {
  let token: string
  try {
    token = await getManagementToken()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  try {
    const response = await fetch(
      `${MGMT_API_BASE}/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(60_000),
      },
    )

    const text = await response.text().catch(() => '')

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}: ${text.slice(0, 500)}`,
      }
    }

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    return {
      ok: true,
      status: response.status,
      rows: Array.isArray(data) ? data : [data],
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
