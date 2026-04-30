// app/api/allegro/test/route.ts
// Sprint S3 main — diagnostic GET endpoint to verify Allegro OAuth +
// searchOffers end-to-end. Owner-scoped: reads cookies session, mints/uses
// cached Allegro token via getAllegroToken(), calls /offers/listing.
//
// Usage:
//   GET /api/allegro/test?phrase=coca-cola&limit=5
//
// Returns JSON з timing breakdown (token vs search), meta counts і sample.
// On error returns {success:false, error} 500. Auth required (401 без sesji).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAllegroToken, searchOffers } from '@/lib/allegro/client'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const phrase = url.searchParams.get('phrase') ?? 'coca-cola'
  const limitRaw = url.searchParams.get('limit') ?? '5'
  const limit = Math.min(60, Math.max(1, parseInt(limitRaw, 10) || 5))

  const startTotal = Date.now()
  try {
    const startToken = Date.now()
    await getAllegroToken()
    const tokenMs = Date.now() - startToken

    const startSearch = Date.now()
    const listing = await searchOffers(phrase, { limit })
    const searchMs = Date.now() - startSearch

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
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
