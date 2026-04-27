// lib/ceidg/scoring.ts
// Phase 2.6 / Layer 2: 4-channel HoReCa scoring.
//
// Channels: sklep / restaurant / catering / cafe.
// Każdy channel ma 6 layers (max 100 punktów):
//   L1: PKD profile fit         (max 30) — channel-specific
//   L2: Brand signal             (max 15) — channel-agnostic
//   L3: Owner-affinity           (max 15) — channel-agnostic
//   L4: Contact data             (max 10) — channel-agnostic
//   L5: Multi-PKD breadth        (max 15) — channel-agnostic
//   L6: Recency (data_rozpoczecia)(max 15) — channel-agnostic
//
// Layers L2-L6 są identyczne dla wszystkich 4 channel-i — różnica
// między channel-ami pochodzi WYŁĄCZNIE z L1 (PKD fit). Czyli
// dominant_channel = ten który ma najwyższy L1.
//
// Meta-score = max(channel_scores) + multi_channel_bonus, cap 100.
//   bonus = (count of channels >= 50) * 3, cap +12
// Dominant: 'multi' jeśli max - second_max <= 5; inaczej channel z max.
// (Vadym confirmation: literal komentarz "дуже близькі scores".)
//
// Scoring jest pure deterministic — zero AI calls, zero external IO.

import type { ScoreableProspect } from './filters'

export type Channel = 'sklep' | 'restaurant' | 'catering' | 'cafe'
export type DominantChannel = Channel | 'multi'

// ────────────────────────────────────────────────────────────
// Channel profiles — które PKDs sygnalizują dany channel.
// pkdMain: trigger dla L1 +20 main bonus.
// pkdAll:  PKDs które dają supporting +2 (cap +10) jeśli obecne w
//          pkd_all (oprócz pkd_main).
// ────────────────────────────────────────────────────────────
export const CHANNEL_PROFILES: Record<
  Channel,
  { pkdMain: readonly string[]; pkdAll: readonly string[] }
> = {
  sklep: {
    pkdMain: ['4711Z', '4725Z'],
    pkdAll: ['4711Z', '4725Z', '5610A'],
  },
  restaurant: {
    pkdMain: ['5610A'],
    pkdAll: ['5610A', '5610B', '5621Z', '5629Z', '5630Z'],
  },
  catering: {
    pkdMain: ['5621Z'],
    pkdAll: ['5621Z'],
  },
  cafe: {
    pkdMain: ['5610A', '5630Z'],
    pkdAll: ['5610A', '5630Z', '1071Z', '1083Z'],
  },
}

// ────────────────────────────────────────────────────────────
// Chain detection — sieci handlowe / franchise networks.
// Match przez regex Unicode-aware boundary, case-insensitive na
// opisach uprawnień (concat z raw_data.uprawnienia[].opis). W V1
// scoring NIE jest down-rankowany — flagujemy tylko (brand +
// loyalty_tier) do score_breakdown.chain dla UI segregacji + V2
// re-scoring (gdy zmienimy weights bez re-fetch detail).
//
// CHAIN_LOYALTY_TIERS — 3 poziomy procurement autonomy w PL retail:
//   'closed' — HQ-only procurement, franchisee NIE może kupować od
//              zewnętrznych dostawców. Marne leady dla food traderа.
//   'hybrid' — Mixed: mainstream przez HQ, ale window dla local/
//              regional/ethnic suppliers. Cele leady — można sprzedać.
//   'open'   — Każdy store decyduje sam. Optymalne leady.
//
// TODO V2: chain_loyalty_tier multiplier:
//   - 'closed' → score × 0.2 (no value, HQ-only procurement)
//   - 'hybrid' → score × 0.85 (legitimate but lower priority)
//   - 'open'   → score × 1.0 (no penalty, real decision-maker)
//   - non-chain → score × 1.0
//
// ВАЖНЕ: kolejność w CHAIN_BRANDS ma znaczenie — detectChain zwraca
// pierwsze dopasowanie. Dłuższe/bardziej specyficzne brands na
// początku ('Carrefour Express' przed 'Carrefour' żeby nie złapać
// short-form gdy w opisie był extended).
// ────────────────────────────────────────────────────────────
export type ChainLoyaltyTier = 'closed' | 'hybrid' | 'open'

export const CHAIN_LOYALTY_TIERS: Record<string, ChainLoyaltyTier> = {
  // closed — HQ-only procurement
  Żabka: 'closed',
  Biedronka: 'closed',
  Lidl: 'closed',
  Auchan: 'closed',
  Carrefour: 'closed',
  'Carrefour Express': 'closed',
  Tesco: 'closed',
  Dino: 'closed',

  // hybrid — central + local supplier window
  Lewiatan: 'hybrid',
  Społem: 'hybrid',
  Stokrotka: 'hybrid',
  Polomarket: 'hybrid',
  Groszek: 'hybrid',

  // open — each store decides independently
  abc: 'open',
  'Delikatesy Centrum': 'open',
}

// Order matters — multi-word brands FIRST żeby nie złapać "Carrefour"
// inside "Carrefour Express", lub "Centrum" inside "Delikatesy Centrum".
export const CHAIN_BRANDS = [
  'Carrefour Express',
  'Delikatesy Centrum',
  'Żabka',
  'Lewiatan',
  'Carrefour',
  'Społem',
  'Stokrotka',
  'Biedronka',
  'Lidl',
  'Auchan',
  'Tesco',
  'Dino',
  'Polomarket',
  'Groszek',
  'abc',
] as const

// ────────────────────────────────────────────────────────────
// Owner-affinity patterns
// ────────────────────────────────────────────────────────────
const CYRILLIC_REGEX = /[Ѐ-ӿ]/
// UA latin transliterated suffixes (nazwisko ending). Zamierzone
// pominięcia: -ski (Polish), -ova (UA OK ale też CZ — przyjmujemy UA).
const UA_SUFFIX_REGEX =
  /(enko|chuk|yuk|ovych|ova|ivna|sky|skyy|iv)$/i
// Polish "uk"/"yk"/"ko" overlap z UA — included as UA (more inclusive).
const UA_SUFFIX_LOOSE_REGEX = /(uk|yk|ko)$/i
// UA-specific first names (rare in PL) — extra signal kiedy nazwisko
// nie złapane przez suffix regex (np. "Maksym Reva" — Reva nie ma
// UA suffix, ale Maksym = UA name).
const UA_FIRST_NAMES = new Set<string>([
  'maksym', 'mykhailo', 'oleh', 'liudmyla', 'yuliya', 'anastasiia',
  'volodymyr', 'pavlo', 'andriy', 'iryna', 'tetiana', 'oleksandr',
  'bohdan', 'sviatoslav', 'mykola', 'dmytro', 'serhii', 'kateryna',
  'sofiia', 'ivanna', 'taras', 'ostap', 'olena', 'nataliia',
  'yurii', 'oleksii', 'vitalii', 'denys', 'oleksiy', 'bohdana',
])

const VIETNAMESE_REGEX =
  /[ạảâấầẩẫậăắằẳẵặĐđèéẹẻẽêếềểễệỉĩịòóọỏõôốồổỗộơớờởỡợùúụủũưứừửữựỳýỵỷỹ]/i

const CHINESE_SURNAMES = new Set<string>([
  'wang','li','zhang','liu','chen','yang','zhao','huang','zhou','wu',
  'xu','sun','hu','zhu','gao','lin','he','guo','ma','liang',
  'song','zheng','xie','han','tang','feng','yu','dong','xiao','cheng',
  'cao','yuan','deng','fu','shen','zeng','peng','lu','su','jiang',
  'cai','jia','pan','wei','tian','du','ding','yao','fang','shi','tan',
])
const KOREAN_SURNAMES = new Set<string>([
  'kim','lee','park','choi','jung','kang','cho','yoon','jang','lim',
])
const JAPANESE_SURNAMES = new Set<string>([
  'sato','suzuki','takahashi','tanaka','watanabe','ito','yamamoto',
  'nakamura','kobayashi',
])

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Wyciąga concat uprawnienia[].opis z raw_data, lowercase, joined ' | '.
 * Skip strings === 'undefined' (CEIDG bug — niektóre uprawnienia
 * zwracają literal "undefined" jako opis, vide Oleh Hopchenko probe).
 */
export function extractOpisText(rawData: unknown): string {
  if (!rawData || typeof rawData !== 'object') return ''
  const upr = (rawData as { uprawnienia?: unknown }).uprawnienia
  if (!Array.isArray(upr)) return ''
  const opisList: string[] = []
  for (const u of upr) {
    if (!u || typeof u !== 'object') continue
    const o = (u as { opis?: unknown }).opis
    if (typeof o === 'string' && o !== 'undefined' && o.length > 0) {
      opisList.push(o.toLowerCase())
    }
  }
  return opisList.join(' | ')
}

export interface ChainDetection {
  detected: boolean
  brand: string | null
  loyalty_tier: ChainLoyaltyTier | null
}

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function detectChain(opisText: string): ChainDetection {
  if (!opisText) return { detected: false, brand: null, loyalty_tier: null }
  for (const brand of CHAIN_BRANDS) {
    // Unicode-aware word boundary: JS \b jest ASCII-only (działa tylko
    // dla [A-Za-z0-9_]), więc \bżabka\b NIE złapałby 'żabka' bo 'ż'
    // nie jest ASCII word char. Używamy lookbehind/lookahead z
    // Unicode property class \p{L}\p{N} (wymaga flag 'u').
    const regex = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegex(brand.toLowerCase())}(?![\\p{L}\\p{N}])`,
      'iu',
    )
    if (regex.test(opisText)) {
      return {
        detected: true,
        brand,
        loyalty_tier: CHAIN_LOYALTY_TIERS[brand] ?? null,
      }
    }
  }
  return { detected: false, brand: null, loyalty_tier: null }
}

/** Normalize string for brand-vs-owner comparison: strip non-alphanum +
 * lowercase + accent folding. Dwa stringi po normalizacji tożsame =
 * "to to samo z dokładnością do białych znaków/akcentów". */
function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacriticals
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

// ────────────────────────────────────────────────────────────
// LAYER 1: PKD profile fit (max 30 points)
//   +20 main match (channel-specific rules — patrz CHANNEL_PROFILES + spec)
//   +2 per supporting PKD w pkd_all (oprócz pkd_main), cap +10
// ────────────────────────────────────────────────────────────
export function scorePkdLayer(
  p: ScoreableProspect,
  channel: Channel,
  opisText: string,
): number {
  const profile = CHANNEL_PROFILES[channel]
  const pkdAll = p.pkd_all ?? []
  const allowedAllSet = new Set<string>(profile.pkdAll)

  // ── Main match (+20) — channel-specific rules ──
  let mainMatched = false

  if (channel === 'sklep') {
    mainMatched = !!p.pkd_main && profile.pkdMain.includes(p.pkd_main)
  } else if (channel === 'restaurant') {
    // pkd_main = 5610A AND pkd_all subset z [5610A, 5610B, 5621Z, 5629Z, 5630Z]
    if (p.pkd_main === '5610A') {
      mainMatched = pkdAll.every((c) => allowedAllSet.has(c))
    }
  } else if (channel === 'catering') {
    // pkd_main = 5621Z OR (5621Z w pkd_all AND opis matches catering regex)
    if (p.pkd_main === '5621Z') {
      mainMatched = true
    } else if (pkdAll.includes('5621Z')) {
      if (/catering|przygotowanie|imprezy|wydarzenia/i.test(opisText)) {
        mainMatched = true
      }
    }
  } else if (channel === 'cafe') {
    // pkd_main IN [5610A, 5630Z] AND (1071Z|1083Z w pkd_all OR opis matches)
    if (p.pkd_main && profile.pkdMain.includes(p.pkd_main)) {
      const hasBakeryPkd = pkdAll.includes('1071Z') || pkdAll.includes('1083Z')
      const opisMatch = /kawiarnia|cukiernia|piekarnia|cafe|coffee/i.test(opisText)
      if (hasBakeryPkd || opisMatch) {
        mainMatched = true
      }
    }
  }

  let score = mainMatched ? 20 : 0

  // ── Supporting (+2 per match in pkd_all ∩ profile.pkdAll, excluding
  //    pkd_main, cap 5 matches → cap +10) ──
  const supportingCount = pkdAll
    .filter((c) => c !== p.pkd_main && allowedAllSet.has(c))
    .length
  score += Math.min(supportingCount, 5) * 2

  return score
}

// ────────────────────────────────────────────────────────────
// LAYER 2: Brand signal (max 15)
//   +10 jeśli name !== owner_name (po normalizacji) — sugeruje istnienie
//        brand identity ponad imię+nazwisko właściciela.
//   +5 jeśli name.length > 25 — pełna brand identity (sieci, restauracje
//        z dłuższą nazwą).
// ────────────────────────────────────────────────────────────
export function scoreBrandLayer(p: ScoreableProspect): number {
  let score = 0
  const nameNorm = normalize(p.name || '')
  const ownerNorm = normalize(p.owner_name || '')
  if (nameNorm && ownerNorm && nameNorm !== ownerNorm) {
    score += 10
  }
  if ((p.name || '').length > 25) {
    score += 5
  }
  return score
}

// ────────────────────────────────────────────────────────────
// LAYER 3: Owner-affinity (max 15)
//   +15 cyrillic OR UA suffix OR UA first name
//   +10 vietnam diacritics OR chinese/korean/japanese surname (asian +10)
//   +0 else
// ────────────────────────────────────────────────────────────
export function scoreOwnerAffinityLayer(p: ScoreableProspect): number {
  const ownerName = p.owner_name ?? ''
  if (!ownerName) return 0

  // 1. Cyrillic anywhere → +15
  if (CYRILLIC_REGEX.test(ownerName)) return 15

  // 2. UA suffix on nazwisko (last word)
  const parts = ownerName.trim().split(/\s+/)
  const lastName = parts[parts.length - 1] ?? ''
  const firstName = parts[0] ?? ''
  if (UA_SUFFIX_REGEX.test(lastName)) return 15
  // UA first name
  if (UA_FIRST_NAMES.has(firstName.toLowerCase())) return 15
  // Loose suffix (uk/yk/ko) — niższe pewność, ale nadal częste
  if (UA_SUFFIX_LOOSE_REGEX.test(lastName)) return 15

  // 3. Asian +10
  if (VIETNAMESE_REGEX.test(ownerName)) return 10
  const lastLower = lastName.toLowerCase()
  if (
    CHINESE_SURNAMES.has(lastLower) ||
    KOREAN_SURNAMES.has(lastLower) ||
    JAPANESE_SURNAMES.has(lastLower)
  ) {
    return 10
  }

  return 0
}

// ────────────────────────────────────────────────────────────
// LAYER 4: Contact data (max 10)
// ────────────────────────────────────────────────────────────
export function scoreContactLayer(p: ScoreableProspect): number {
  let score = 0
  if (p.email) score += 5
  if (p.telefon) score += 5
  return score
}

// ────────────────────────────────────────────────────────────
// LAYER 5: Multi-PKD breadth (max 15)
//   [3,10]:  +15 sweet spot — established but focused
//   [11,30]: +8  broader but ok
//   [31,50]: +3  broad portfolio, weaker fit
//   [1,2]:   +5  just starting / very specialized
//   [0]:     +0  no PKDs (defensive — shouldn't happen jeśli filters OK)
// ────────────────────────────────────────────────────────────
export function scoreBreadthLayer(p: ScoreableProspect): number {
  const len = p.pkd_all?.length ?? 0
  if (len === 0) return 0
  if (len <= 2) return 5
  if (len <= 10) return 15
  if (len <= 30) return 8
  if (len <= 50) return 3
  return 0 // > 50 — wykluczone w filters anyway
}

// ────────────────────────────────────────────────────────────
// LAYER 6: Recency by data_rozpoczecia (max 15)
//   ≤12 mo: +15 — fresh business, hungry for suppliers
//   ≤36 mo: +10
//   ≤84 mo: +5  — established, possibly settled with suppliers
//   >84 mo: +2
// ────────────────────────────────────────────────────────────
export function scoreRecencyLayer(p: ScoreableProspect): number {
  if (!p.data_rozpoczecia) return 0
  const start = Date.parse(p.data_rozpoczecia)
  if (Number.isNaN(start)) return 0
  const months = (Date.now() - start) / (1000 * 60 * 60 * 24 * 30.44)
  if (months <= 12) return 15
  if (months <= 36) return 10
  if (months <= 84) return 5
  return 2
}

// ────────────────────────────────────────────────────────────
// Per-channel total
// ────────────────────────────────────────────────────────────
export interface ChannelBreakdown {
  pkd: number
  brand: number
  owner: number
  contact: number
  breadth: number
  recency: number
  total: number
}

function scoreChannel(
  p: ScoreableProspect,
  channel: Channel,
  opisText: string,
  shared: { brand: number; owner: number; contact: number; breadth: number; recency: number },
): ChannelBreakdown {
  const pkd = scorePkdLayer(p, channel, opisText)
  const total = pkd + shared.brand + shared.owner + shared.contact + shared.breadth + shared.recency
  return {
    pkd,
    brand: shared.brand,
    owner: shared.owner,
    contact: shared.contact,
    breadth: shared.breadth,
    recency: shared.recency,
    total: Math.min(total, 100),
  }
}

// ────────────────────────────────────────────────────────────
// Meta + dominant calc
// ────────────────────────────────────────────────────────────
function computeMeta(scores: Record<Channel, number>): {
  metaRaw: number
  max: number
  maxChannel: Channel
  secondMax: number
  multiBonus: number
  dominant: DominantChannel
} {
  const entries = (Object.entries(scores) as [Channel, number][]).sort(
    ([, a], [, b]) => b - a,
  )
  const max = entries[0][1]
  const maxChannel = entries[0][0]
  const secondMax = entries[1][1]
  const above50 = Object.values(scores).filter((s) => s >= 50).length
  const multiBonus = Math.min(above50 * 3, 12)
  const metaRaw = Math.min(max + multiBonus, 100)
  const dominant: DominantChannel =
    max - secondMax <= 5 ? 'multi' : maxChannel
  return { metaRaw, max, maxChannel, secondMax, multiBonus, dominant }
}

// ────────────────────────────────────────────────────────────
// Final API
// ────────────────────────────────────────────────────────────
export interface ScoreBreakdown {
  sklep: ChannelBreakdown
  restaurant: ChannelBreakdown
  catering: ChannelBreakdown
  cafe: ChannelBreakdown
  meta: {
    max_channel: Channel
    max_score: number
    multi_bonus: number
    final: number
  }
  filter: { passed: boolean; reason: string | null }
  chain: {
    detected: boolean
    brand: string | null
    loyalty_tier: ChainLoyaltyTier | null
  }
}

export interface ProspectScores {
  sklep_score: number
  restaurant_score: number
  catering_score: number
  cafe_score: number
  horeca_meta_score: number
  dominant_channel: DominantChannel
  is_chain_franchise: boolean
  chain_brand: string | null
  score_breakdown: ScoreBreakdown
}

export function scoreProspect(p: ScoreableProspect): ProspectScores {
  const opisText = extractOpisText(p.raw_data)
  const chain = detectChain(opisText)

  // L2-L6 są channel-agnostic — wyliczane raz, reused dla 4 channels.
  const shared = {
    brand: scoreBrandLayer(p),
    owner: scoreOwnerAffinityLayer(p),
    contact: scoreContactLayer(p),
    breadth: scoreBreadthLayer(p),
    recency: scoreRecencyLayer(p),
  }

  const sklep = scoreChannel(p, 'sklep', opisText, shared)
  const restaurant = scoreChannel(p, 'restaurant', opisText, shared)
  const catering = scoreChannel(p, 'catering', opisText, shared)
  const cafe = scoreChannel(p, 'cafe', opisText, shared)

  const meta = computeMeta({
    sklep: sklep.total,
    restaurant: restaurant.total,
    catering: catering.total,
    cafe: cafe.total,
  })

  return {
    sklep_score: sklep.total,
    restaurant_score: restaurant.total,
    catering_score: catering.total,
    cafe_score: cafe.total,
    horeca_meta_score: meta.metaRaw,
    dominant_channel: meta.dominant,
    is_chain_franchise: chain.detected,
    chain_brand: chain.brand,
    score_breakdown: {
      sklep,
      restaurant,
      catering,
      cafe,
      meta: {
        max_channel: meta.maxChannel,
        max_score: meta.max,
        multi_bonus: meta.multiBonus,
        final: meta.metaRaw,
      },
      filter: { passed: true, reason: null },
      chain: {
        detected: chain.detected,
        brand: chain.brand,
        loyalty_tier: chain.loyalty_tier,
      },
    },
  }
}
