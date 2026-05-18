// lib/supabase/admin.ts
// Sprint S-ORDER.1.B.1 (19.05.2026)
//
// Service-role Supabase client for server-only routes that bypass RLS.
//
// Use ONLY in:
//   - app/api/orders/[token]/* (public form endpoints — manually validates
//     access_token у URL, fetches matching order/products через service-role)
//   - scripts/ (background jobs)
//
// NEVER expose to client components. Service-role has full DB access (bypasses
// all RLS policies). Caller is responsible for authorization (checking
// access_token, status, etc.) перш ніж returning data.

import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars',
    )
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
