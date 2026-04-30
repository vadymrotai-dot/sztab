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
// Actor: parseforge~allegro-scraper (selected after automation-lab~
// allegro-scraper failed на DataDome anti-bot 2/2 attempts including
// з RESIDENTIAL proxy). parseforge build 1.0.8 (2026-04-24, 6 days
// old at swap) має fresh DataDome bypass + native searchQuery field.
//
// Cost: ~$0.0075/result (FREE tier) + $0/start. ~$0.038 для 5-item query.
// Free tier maxItems hard-capped at 10 by actor.

import { createClient } from '@/lib/supabase/server'
import { runApifyActor } from '@/lib/integrations/apify'
import type {
  AllegroOffer,
  AllegroOfferListingResponse,
  SearchOffersOptions,
} from './types'

const ALLEGRO_ACTOR_ID = 'parseforge~allegro-scraper'
const RUN_TIMEOUT_SECS = 240 // 4 min — actor cold-start + scrape
const FREE_TIER_MAX_ITEMS = 10

/**
 * Apify actor output item (parseforge schema). Documented fields:
 *   imageUrl, title, url, price, priceText, currency, seller, rating,
 *   reviewCount, freeShipping, isSmart, scrapedAt, error
 */
interface ApifyAllegroItem {
  imageUrl?: string | null
  title?: string
  url?: string
  price?: number | null
  priceText?: string | null
  currency?: string | null
  seller?: string | null
  rating?: string | number | null
  reviewCount?: string | number | null
  freeShipping?: boolean
  isSmart?: boolean
  scrapedAt?: string
  error?: string
}

function adaptItem(item: ApifyAllegroItem, fallbackIndex: number): AllegroOffer {
  // Allegro offer URLs end з numeric ID: ".../oferta/...-12375564256".
  const idFromUrl = item.url?.match(/-(\d{6,})(?:[?#]|$)/)?.[1]
  const id = idFromUrl ?? `apify-${fallbackIndex}`
  const name = item.title ?? '(no title)'

  const priceAmount =
    typeof item.price === 'number'
      ? item.price.toFixed(2)
      : typeof item.priceText === 'string' && item.priceText.length > 0
        ? item.priceText
        : '0.00'
  const currency = item.currency ?? 'PLN'

  const seller = item.seller ?? 'unknown'
  const images = item.imageUrl ? [{ url: item.imageUrl }] : []

  return {
    id,
    name,
    category: { id: '' }, // parseforge не returns category
    images,
    sellingMode: { price: { amount: priceAmount, currency } },
    seller: {
      id: seller,
      login: seller,
      superSeller: false, // parseforge не returns this flag
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

  const requested = Math.max(1, opts.limit ?? 5)
  const maxItems = Math.min(requested, FREE_TIER_MAX_ITEMS)

  const run = await runApifyActor<ApifyAllegroItem>(token, {
    actorId: ALLEGRO_ACTOR_ID,
    input: {
      searchQuery: phrase,
      maxItems,
      sortBy: '',
    },
    timeoutSecs: RUN_TIMEOUT_SECS,
  })

  if (run.status !== 'SUCCEEDED') {
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
