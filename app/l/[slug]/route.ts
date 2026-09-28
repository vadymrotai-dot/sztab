// app/l/[slug]/route.ts — publiczny redirect: krótki link klienta → świeży
// Supabase magic-link (28.09.2026). Zob. lib/portal/login-link.ts.
//
// Celowo PUBLICZNY (bez auth) — odwiedza go klient, który jeszcze nie jest
// zalogowany. Bezpieczeństwo = losowość slugu (8 bajtów, ~64 bity) + TTL
// (portal_login_links.expires_at, 3 dni od utworzenia linku w adminie).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generatePortalLoginLink, SITE_URL } from '@/lib/portal/login-link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: linkRow } = await admin
    .from('portal_login_links')
    .select('client_id, expires_at')
    .eq('slug', slug)
    .maybeSingle()

  if (!linkRow || new Date(linkRow.expires_at as string) < new Date()) {
    return NextResponse.redirect(`${SITE_URL}/portal/login?link=expired`)
  }

  const { data: acc } = await admin
    .from('client_portal_accounts')
    .select('email')
    .eq('client_id', linkRow.client_id as string)
    .eq('status', 'approved')
    .maybeSingle()

  if (!acc?.email) {
    return NextResponse.redirect(`${SITE_URL}/portal/login?link=expired`)
  }

  const freshLink = await generatePortalLoginLink(acc.email as string)
  if (!freshLink) {
    return NextResponse.redirect(`${SITE_URL}/portal/login?link=expired`)
  }

  return NextResponse.redirect(freshLink)
}
