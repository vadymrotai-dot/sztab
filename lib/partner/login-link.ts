// lib/partner/login-link.ts — magic-link (Supabase Admin API) + krótkie,
// "żywe" linki logowania /l/p/<slug> dla partnerów. Analog
// lib/portal/login-link.ts — zob. tam pełny komentarz o PKCE/hash-fragment.
// Celowo OSOBNA tabela/routing (partner_login_links, /l/p/[slug]) — zero
// ryzyka dla działającego /l/[slug] klientów.

import 'server-only'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sztab.vercel.app'

const SHORT_LINK_TTL_MS = 3 * 24 * 60 * 60 * 1000 // 3 dni

export async function generatePartnerLoginLink(email: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${SITE_URL}/auth/token-redirect?next=/partner-portal` },
  })
  if (error || !data?.properties?.action_link) return null
  return data.properties.action_link
}

function makeSlug(): string {
  return crypto.randomBytes(8).toString('base64url') // 11 znaków, URL-safe
}

export async function getOrCreateShortPartnerLoginLink(
  partnerAccountId: string,
  createdBy: string,
): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('partner_login_links')
    .select('slug')
    .eq('partner_account_id', partnerAccountId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { ok: true, link: `${SITE_URL}/l/p/${existing.slug}` }
  }

  const slug = makeSlug()
  const expiresAt = new Date(Date.now() + SHORT_LINK_TTL_MS).toISOString()

  const { error } = await admin.from('partner_login_links').insert({
    slug,
    partner_account_id: partnerAccountId,
    created_by: createdBy,
    expires_at: expiresAt,
  })
  if (error) return { ok: false, error: error.message }

  return { ok: true, link: `${SITE_URL}/l/p/${slug}` }
}
