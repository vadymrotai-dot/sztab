import 'server-only'

// lib/allegro/scraper.ts
// Sprint S3 main (continuation) — Apify-based Allegro search.
//
// WHY scraper instead of REST API: Allegro REST /offers/listing returns
// 403 AccessDenied для unverified apps (Allegro 2024+ policy). Verified
// app submission jest задачą на пізніше. До того часу — scraper fallback
// що returns identical AllegroOfferListingResponse shape so downstream
// callers don't care which path produced data.
//
// Actor: automation-lab~allegro-scraper (battle-tested, 1.7k+ runs,
// explicit listings extraction with title/price/seller/images).
//
// Cost: ~$0.00345/product + $0.005/run start fee (free plan).
// Rate-limit/concurrency handled by Apify side.

import { createClient } from '@/lib/supabase/server'
import { runApifyActor } from '@/lib/integrations/apify'
import type {
  AllegroOffer,
  AllegroOfferListingResponse,
  SearchOffersOptions,
} from './types'

const ALLEGRO_ACTOR_ID = 'automation-lab~allegro-scraper'
const RUN_TIMEOUT_SECS = 180 // 3 min — actor cold-start + scrape

/**
 * Apify actor output item (subset of fields we map). Actor returns
 * ~20+ fields per product; we extract only those needed for AllegroOffer.
 */
interface ApifyAllegroItem {
  id?: string
  title?: string
  url?: string
  price?: number | string | null
  currency?: string | null
  category?: string | null
  categoryPath?: string | null
  images?: string[] | null
  image?: string | null
  sellerLogin?: string | null
  sellerName?: string | null
  sellerUrl?: string | null
  superSeller?: boolean | null
  isSuperSeller?: boolean | null
  sponsored?: boolean | null
}

function adaptItem(item: ApifyAllegroItem, fallbackIndex: number): AllegroOffer {
  const id = item.id ?? `apify-${fallbackIndex}`
  const name = item.title ?? '(no title)'
  const categoryStr =
    item.categoryPath ?? item.category ?? ''
  const priceAmount =
    typeof item.price === 'number'
      ? item.price.toFixed(2)
      : typeof item.price === 'string' && item.price.length > 0
        ? item.price
        : '0.00'
  const currency = item.currency ?? 'PLN'
  const imagesRaw = Array.isArray(item.images)
    ? item.images
    : item.image
      ? [item.image]
      : []
  const sellerLogin = item.sellerLogin ?? item.sellerName ?? 'unknown'

  return {
    id,
    name,
    category: { id: categoryStr },
    images: imagesRaw.filter((u): u is string => typeof u === 'string').map((url) => ({ url })),
    sellingMode: { price: { amount: priceAmount, currency } },
    seller: {
      id: sellerLogin,
      login: sellerLogin,
      superSeller: Boolean(item.superSeller ?? item.isSuperSeller ?? false),
    },
  }
}

/**
 * Scrape Allegro search results via Apify. Returns same shape as
 * client.searchOffers() so callers can be mode-agnostic.
 *
 * @throws коли apify token не configured, actor run fails, или timeout
 */
export async function searchOffersViaApify(
  phrase: string,
  opts: SearchOffersOptions = {},
): Promise<AllegroOfferListingResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Allegro scraper: brak sesji użytkownika.')
  }

  const { data, error } = await supabase
    .from('params')
    .select('apify_api_token')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (error) {
    throw new Error(`Allegro scraper: nie można odczytać params (${error.message})`)
  }
  const token = (data as { apify_api_token?: string | null } | null)?.apify_api_token
  if (!token) {
    throw new Error(
      'Apify token not configured. Set in /settings → Klucze API.',
    )
  }

  const limit = Math.min(100, Math.max(1, opts.limit ?? 24))

  const run = await runApifyActor<ApifyAllegroItem>(token, {
    actorId: ALLEGRO_ACTOR_ID,
    input: {
      searchQueries: [phrase],
      maxItemsPerQuery: limit,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    },
    timeoutSecs: RUN_TIMEOUT_SECS,
  })

  if (run.status !== 'SUCCEEDED') {
    // Sanitize potential token echoed in error (defensive — actor errors
    // don't typically echo it but keep symmetric з client.ts redaction).
    const safe = (run.error ?? `actor status ${run.status}`)
      .slice(0, 300)
      .replace(/[a-zA-Z0-9._-]{20,}/g, '<redacted>')
    throw new Error(`Allegro scraper: ${safe}`)
  }

  const adapted = run.items.map((item, idx) => adaptItem(item, idx))

  return {
    items: {
      promoted: [],
      regular: adapted,
    },
    searchMeta: {
      totalCount: adapted.length,
      availableCount: adapted.length,
    },
  }
}
