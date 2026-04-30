// lib/allegro/types.ts
// Sprint S3 main — lean Allegro REST API types. Only fields S3 main uses.
// Don't model entire Allegro surface — extend per future sprint feature.

/** OAuth token endpoint response (POST /auth/oauth/token). */
export interface AllegroTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
  jti?: string
}

/** Money amount as returned by Allegro (string preserves precision). */
export interface AllegroPriceAmount {
  amount: string
  currency: string
}

/** Offer image — array entry under offer.images. */
export interface AllegroOfferImage {
  url: string
}

/** Seller card embedded у offer.seller. */
export interface AllegroSeller {
  id: string
  login: string
  superSeller?: boolean
}

/** Offer summary returned by /offers/listing items.{promoted|regular}. */
export interface AllegroOffer {
  id: string
  name: string
  category: { id: string }
  images: AllegroOfferImage[]
  sellingMode: { price: AllegroPriceAmount }
  seller: AllegroSeller
}

/** Top-level response of GET /offers/listing. */
export interface AllegroOfferListingResponse {
  items: {
    promoted: AllegroOffer[]
    regular: AllegroOffer[]
  }
  searchMeta: {
    totalCount: number
    availableCount: number
  }
}

/** Optional knobs дla searchOffers(). */
export interface SearchOffersOptions {
  /** 1-60, default 24 */
  limit?: number
  /** offset для pagination, default 0 */
  offset?: number
  /** Allegro category ID (e.g. "316070") */
  category?: string
  /** Allegro sort param (e.g. "-price", "+name") */
  sort?: string
}
