// app/l/p/[slug]/route.ts — publiczny redirect: krótki link partnera →
// świeży Supabase magic-link. Analog app/l/[slug]/route.ts dla klientów,
// zob. tam pełny komentarz. Celowo PUBLICZNY (bez auth) — bezpieczeństwo =
// losowość slugu (8 bajtów, ~64 bity) + TTL (partner_login_links.expires_at).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generatePartnerLoginLink, SITE_URL } from '@/lib/partner/login-link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: linkRow } = await admin
    .from('partner_login_links')
    .select('partner_account_id, expires_at')
    .eq('slug', slug)
    .maybeSingle()

  if (!linkRow || new Date(linkRow.expires_at as string) < new Date()) {
    return NextResponse.redirect(`${SITE_URL}/partner-portal/login?link=expired`)
  }

  const { data: acc } = await admin
    .from('partner_accounts')
    .select('email, active')
    .eq('id', linkRow.partner_account_id as string)
    .eq('active', true)
    .maybeSingle()

  if (!acc?.email) {
    return NextResponse.redirect(`${SITE_URL}/partner-portal/login?link=expired`)
  }

  const freshLink = await generatePartnerLoginLink(acc.email as string)
  if (!freshLink) {
    return NextResponse.redirect(`${SITE_URL}/partner-portal/login?link=expired`)
  }

  return NextResponse.redirect(freshLink)
}
