// app/api/allegro/test/route.ts
// Sprint S3 main — diagnostic GET endpoint for Allegro integrations.
// Two modes:
//   ?mode=api      → REST /offers/listing (currently 403 для unverified app;
//                    keep wired для future "verified app" path)
//   ?mode=scraper  → Apify scraper (default; works today)
//
// Usage:
//   GET /api/allegro/test?mode=scraper&phrase=coca-cola&limit=5
//
// Same response shape незалежно від mode plus a `mode` field для debugging.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAllegroToken, searchOffers } from '@/lib/allegro/client'
import { searchOffersViaApify } from '@/lib/allegro/scraper'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Mode = 'api' | 'scraper'

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const modeRaw = (url.searchParams.get('mode') ?? 'scraper').toLowerCase()
  if (modeRaw !== 'api' && modeRaw !== 'scraper') {
    return NextResponse.json(
      { success: false, error: `Invalid mode '${modeRaw}'. Use 'api' or 'scraper'.` },
      { status: 400 },
    )
  }
  const mode = modeRaw as Mode
  const phrase = url.searchParams.get('phrase') ?? 'coca-cola'
  const limitRaw = url.searchParams.get('limit') ?? '5'
  const limit = Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 5))

  const startTotal = Date.now()
  try {
    let tokenMs = 0
    let listing
    let searchMs

    if (mode === 'api') {
      const startToken = Date.now()
      await getAllegroToken()
      tokenMs = Date.now() - startToken

      const startSearch = Date.now()
      listing = await searchOffers(phrase, { limit })
      searchMs = Date.now() - startSearch
    } else {
      // scraper mode — no token mint step
      const startSearch = Date.now()
      listing = await searchOffersViaApify(phrase, { limit })
      searchMs = Date.now() - startSearch
    }

    const totalMs = Date.now() - startTotal
    const promoted = listing.items?.promoted ?? []
    const regular = listing.items?.regular ?? []
    const combined = [...promoted, ...regular].slice(0, limit)

    const sample = combined.map((offer) => ({
      id: offer.id,
      name: offer.name,
      price: offer.sellingMode?.price
        ? `${offer.sellingMode.price.amount} ${offer.sellingMode.price.currency}`
        : null,
      seller: offer.seller?.login ?? null,
      categoryId: offer.category?.id ?? null,
      hasImage: Array.isArray(offer.images) && offer.images.length > 0,
    }))

    return NextResponse.json({
      success: true,
      mode,
      phrase,
      limit,
      timing: { tokenMs, searchMs, totalMs },
      meta: {
        totalCount: listing.searchMeta?.totalCount ?? 0,
        availableCount: listing.searchMeta?.availableCount ?? 0,
        promotedCount: promoted.length,
        regularCount: regular.length,
      },
      sample,
    })
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        mode,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
