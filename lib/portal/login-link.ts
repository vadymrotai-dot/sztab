// lib/portal/login-link.ts — magic-link (Supabase Admin API) + krótkie, "żywe"
// linki logowania /l/<slug> (28.09.2026).
//
// Sam magic-link z Supabase (action_link) to długi, techniczny URL (ich domena
// + token + zakodowany redirect_to) — nie nadaje się do wysyłki klientowi.
// Krótki link /l/<slug> na naszym domenie: KAŻDE odwiedzenie generuje ŚWIEŻY
// magic-link i redirectuje (zob. app/l/[slug]/route.ts) — więc jeden /l/<slug>
// można wysyłać wielokrotnie, bez presji "minęła godzina". Żyje 3 dni
// (portal_login_links.expires_at, scripts/107_portal_login_links.sql).

import 'server-only'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sztab.vercel.app'

const SHORT_LINK_TTL_MS = 3 * 24 * 60 * 60 * 1000 // 3 dni

// Generuje jednorazowy magic-link (Supabase Admin API) bez wysyłki maila.
// UWAGA: link z Admin API NIE wspiera PKCE (brak code_verifier w przeglądarce
// — request idzie z serwera, nie od klienta), więc Supabase przekierowuje z
// tokenami w hash fragmencie (#access_token=...), nie ?code=. Dlatego
// redirectTo wskazuje na /auth/token-redirect (klient czyta hash), a NIE na
// /auth/callback (ten czeka na ?code=, self-service logowanie klientów przez
// signInWithOtp — inny, PKCE, flow).
export async function generatePortalLoginLink(email: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${SITE_URL}/auth/token-redirect?next=/portal` },
  })
  if (error || !data?.properties?.action_link) return null
  return data.properties.action_link
}

function makeSlug(): string {
  return crypto.randomBytes(8).toString('base64url') // 11 znaków, URL-safe
}

// Krótki link /l/<slug> dla klienta clientId — reuse istniejącego (jeszcze
// ważnego), inaczej tworzy nowy (ważny 3 dni). Sam magic-link generowany jest
// DOPIERO przy odwiedzeniu /l/<slug> (świeży za każdym razem) — tu zapisujemy
// tylko slug → client_id.
export async function getOrCreateShortLoginLink(
  clientId: string,
  createdBy: string,
): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('portal_login_links')
    .select('slug')
    .eq('client_id', clientId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { ok: true, link: `${SITE_URL}/l/${existing.slug}` }
  }

  const slug = makeSlug()
  const expiresAt = new Date(Date.now() + SHORT_LINK_TTL_MS).toISOString()

  const { error } = await admin.from('portal_login_links').insert({
    slug,
    client_id: clientId,
    created_by: createdBy,
    expires_at: expiresAt,
  })
  if (error) return { ok: false, error: error.message }

  return { ok: true, link: `${SITE_URL}/l/${slug}` }
}
