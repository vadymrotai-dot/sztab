// lib/intelligence/ukrainian-detect.ts
// Phase 2 Krok 1.E (S-CORE.3.B Phase A, 09.05.2026) — heuristic detector
// для Ukrainian-founder names + CRBR-verified citizenship.
//
// Per Vadym Q5 decision: 'verified' (CRBR-confirmed) + 'high' (UK first +
// UK surname без PL signal) — both detected=true. 'medium' (single UK
// signal) + 'low' (no UK signal) — detected=false (stored у raw signal
// для debugging/manual review).
//
// Use cases:
//   - Backfill (scripts/backfill-ua-founders.ts) — applies to every
//     client + ceidg_prospect row, caches into ua_founders_signal jsonb
//   - Optional UI re-classification (admin tool — Phase B)
//
// NIE Russian/Belarusian detection (per non-goals — different groups,
// окремий sprint якщо знадобиться).

// ─── UK first names list (~30 canonical Romanizations) ────────────

const UK_FIRST_NAMES = new Set<string>([
  // Чоловічі
  'oleh',
  'volodymyr',
  'mykola',
  'oleksii',
  'mykhailo',
  'yurii',
  'maksym',
  'roman',
  'andrii',
  'bohdan',
  'taras',
  'vadym',
  'petro',
  'pavlo',
  'yaroslav',
  'oleksandr',
  'serhii',
  'denys',
  'artem',
  'dmytro',
  'ivan',
  'ihor',
  'vasyl',
  'rostyslav',
  // Жіночі
  'tetyana',
  'liudmyla',
  'iryna',
  'anastasiia',
  'kateryna',
  'oksana',
  'svitlana',
  'natalia',
  'olha',
  'bohdana',
  'solomiya',
  'daryna',
  'khrystyna',
  'halyna',
  'iuliia',
  'oleksandra',
  'yulia',
  'sofiia',
  'mariya',
  'maryna',
])

// UK surname suffixes (case-insensitive). Includes both Romanized і
// occasional PL-typed Ukrainian surnames в українському діаспора у Польщі.
const UK_SURNAME_SUFFIX = /(enko|chuk|iuk|yuk|achuk|ovych|chyk|ovich|enkyi|enkyy)$/i

// PL surname suffixes — NEGATIVE signal (pulls confidence down). Якщо
// присутній → майже завжди Polish person, навіть з UK first name (e.g.
// "Olga Nowak" — Polish-naturalized).
const PL_SURNAME_SUFFIX = /(ski|cki|dzki|owski|ewski|icki|ycki|ynski|inski|akowski)$/i

// ─── Helpers ─────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (ą→a, ć→c, ł→l)
    .replace(/[ʼ`'']/g, '') // strip apostrophes/breaks
    .replace(/\s+/g, ' ')
}

function splitName(fullName: string): { first: string; last: string } | null {
  const cleaned = fullName.trim().replace(/\s+/g, ' ')
  if (!cleaned) return null
  const parts = cleaned.split(' ')
  if (parts.length < 2) return null
  // First = first part. Last = last part. Middle parts ignored (patronymics
  // або middle names не diagnostically relevant для current heuristic).
  return { first: parts[0], last: parts[parts.length - 1] }
}

// ─── Public types ────────────────────────────────────────────────

export type UAConfidence = 'verified' | 'high' | 'medium' | 'low' | null
export type UASource = 'crbr' | 'heuristic' | null

export interface UAFoundersSignal {
  detected: boolean
  confidence: UAConfidence
  source: UASource
  /** Imена що triggered detection (for tooltip + debug). */
  names: string[]
  /** Дebug hints, e.g. ['ukFirstName:vadym', 'ukSurname:enko', 'crbr:ukrainian_citizenship']. */
  signals: string[]
}

export interface CombinedDetectInput {
  /** CRBR beneficiaries (KRS-registered companies only — clients side).
   *  Gives 'verified' confidence якщо хоча б один має UA citizenship/residency. */
  crbrBeneficiaries?: Array<{
    imie: string | null
    nazwisko: string | null
    kraj_rezydencji: string | null
    obywatelstwa: string[]
  }>
  /** decision_maker_name з clients/ceidg_prospects (single full-name string). */
  decisionMakerName?: string | null
  /** owner_name з ceidg_prospects (raw owner — sole-proprietor name). */
  ownerName?: string | null
  /** Persons names через person_company_links (heuristic — multiple). */
  personNames?: string[]
}

// ─── Heuristic-only entry (single full name) ────────────────────

/** Returns confidence + signals для single full name without CRBR context.
 *  detected=true ТІЛЬКИ для 'high' (UK first + UK surname + NO PL surname). */
export function detectUkrainianFromName(
  fullName: string | null | undefined,
): UAFoundersSignal {
  const empty: UAFoundersSignal = {
    detected: false,
    confidence: null,
    source: null,
    names: [],
    signals: [],
  }
  if (!fullName?.trim()) return empty

  const split = splitName(fullName)
  if (!split) return empty

  const first = normalize(split.first)
  const last = normalize(split.last)

  const signals: string[] = []
  const ukFirstMatch = UK_FIRST_NAMES.has(first)
  if (ukFirstMatch) signals.push(`ukFirstName:${first}`)

  const ukSurnameMatch = UK_SURNAME_SUFFIX.exec(last)
  if (ukSurnameMatch) signals.push(`ukSurname:${ukSurnameMatch[1] ?? '?'}`)

  const plSurnameMatch = PL_SURNAME_SUFFIX.exec(last)
  if (plSurnameMatch) signals.push(`plSurname:${plSurnameMatch[1] ?? '?'}`)

  // 'high' = UK first AND UK surname AND NOT PL surname (per Q5)
  if (ukFirstMatch && ukSurnameMatch && !plSurnameMatch) {
    return {
      detected: true,
      confidence: 'high',
      source: 'heuristic',
      names: [fullName],
      signals,
    }
  }

  // 'medium' = ONE of (UK first / UK surname) AND NOT PL — detected=false per Q5
  if ((ukFirstMatch || !!ukSurnameMatch) && !plSurnameMatch) {
    return {
      detected: false,
      confidence: 'medium',
      source: 'heuristic',
      names: [fullName],
      signals,
    }
  }

  // 'low' = no UK signal або PL surname overrides
  return {
    detected: false,
    confidence: 'low',
    source: null,
    names: [fullName],
    signals,
  }
}

// ─── Combined entry (CRBR + multi-name heuristic merge) ─────────

const CONFIDENCE_RANK: Record<string, number> = {
  verified: 4,
  high: 3,
  medium: 2,
  low: 1,
  null: 0,
}

/** Build UAFoundersSignal з CRBR + heuristic. Highest-confidence wins.
 *  CRBR 'verified' (UA citizenship/residency) wins regardless of heuristic. */
export function buildUaFoundersSignal(
  input: CombinedDetectInput,
): UAFoundersSignal {
  // 1. CRBR — VERIFIED якщо ANY beneficiary has UA citizenship або residency
  const crbrUaPersons: string[] = []
  for (const b of input.crbrBeneficiaries ?? []) {
    const isUkrCitizen = b.obywatelstwa.some((c) => {
      const n = normalize(c)
      return (
        n.includes('ukrai') ||
        n === 'ua' ||
        n === 'ukr' ||
        n === 'ukraine' ||
        n === 'ukraina'
      )
    })
    const residency = normalize(b.kraj_rezydencji ?? '')
    const isUkrResident =
      residency.includes('ukrai') ||
      residency === 'ua' ||
      residency === 'ukr' ||
      residency === 'ukraine' ||
      residency === 'ukraina'
    if (isUkrCitizen || isUkrResident) {
      const name = [b.imie, b.nazwisko].filter(Boolean).join(' ').trim()
      if (name) crbrUaPersons.push(name)
    }
  }

  if (crbrUaPersons.length > 0) {
    return {
      detected: true,
      confidence: 'verified',
      source: 'crbr',
      names: crbrUaPersons,
      signals: ['crbr:ukrainian_citizenship_or_residency'],
    }
  }

  // 2. Heuristic — collect candidate names (decision_maker, owner, persons,
  //    plus CRBR names without UA citizenship для secondary heuristic check).
  const candidates: string[] = []
  if (input.decisionMakerName) candidates.push(input.decisionMakerName)
  if (input.ownerName) candidates.push(input.ownerName)
  candidates.push(...(input.personNames ?? []))

  for (const b of input.crbrBeneficiaries ?? []) {
    const name = [b.imie, b.nazwisko].filter(Boolean).join(' ').trim()
    if (name) candidates.push(name)
  }

  // Find highest-confidence match
  let best: UAFoundersSignal = {
    detected: false,
    confidence: null,
    source: null,
    names: [],
    signals: [],
  }
  for (const cand of candidates) {
    const sig = detectUkrainianFromName(cand)
    const candRank = CONFIDENCE_RANK[sig.confidence ?? 'null'] ?? 0
    const bestRank = CONFIDENCE_RANK[best.confidence ?? 'null'] ?? 0
    if (candRank > bestRank) best = sig
  }

  return best
}
