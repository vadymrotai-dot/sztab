// scripts/sprint-n-b5-cold-openers.ts
// Sprint N Phase B5 — generate cold opener для cohort entities via Claude Haiku.
// Persists to cohort_cold_openers (migration 034).

import '@/lib/env'
import * as fs from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

interface CohortEntry {
  id: string
  type: 'client' | 'prospect'
  name: string
  nip: string
  region: string | null
  legal_form: string | null
}

const MODEL = 'claude-haiku-4-5-20251001'
const COST_INPUT = 1.0 / 1_000_000
const COST_OUTPUT = 5.0 / 1_000_000

const SYSTEM = `Jesteś polskim B2B sprzedawcą firmy Czudowa Marka (ChM) — polski producent kiszonek, sałatek, marynat, buraków konserwowanych. Generujesz pierwszy zdanie/dwa cold-emaila do osoby decyzyjnej.

ZASADY:
- 1-2 zdania, MAX 250 znaków
- Język: polski (jeśli właściciel ma typowo polskie imię/nazwisko) lub mix pl-ua dla ukraińskich/białoruskich nazwisk (Ukraina diaspora to ważny target dla ChM kiszonek)
- Personalizacja: wzmiankuj branżę firmy LUB lokalizację LUB konkretny produkt z portfolio ChM pasujący do top match
- Ton: konkretny, bez sprzedażowego żargonu, bez "Czesc!" / "Witam serdecznie!"
- Hook: business intelligence — sygnał dlaczego ChM produkt pasuje do tego klienta
- Output: TYLKO sam tekst opener'a, bez podpisów, bez nagłówków, bez ramek

PRZYKŁADY (dobre):
- "Widzę że KOZAK OLEK prowadzi handel detaliczny w Małopolsce — w naszym portfolio mamy kiszonki Czudowa Marka, które dobrze rotują w sklepach z polską+ukraińską klientelą."
- "Pana sklep w Mławie + asortyment owocowo-warzywny — czy mogłabym pokazać 3 propozycje sałatek gotowych ChM, które wzmacniają marżę impulsywnych zakupów?"

PRZYKŁADY (złe):
- "Witaj! Reprezentuję firmę Czudowa Marka, oferujemy najwyższej jakości produkty..."
- "Czy interesuje Pana współpraca z producentem polskich kiszonek?"`

interface OpenerInput {
  entity_name: string
  legal_form: string | null
  region: string | null
  top_product: string
  family: string
  city: string | null
  owner_name: string | null
  business_summary: string | null
}

function buildUserPrompt(i: OpenerInput): string {
  const lines: string[] = []
  lines.push(`Firma: ${i.entity_name}`)
  if (i.legal_form) lines.push(`Forma prawna: ${i.legal_form}`)
  if (i.region) lines.push(`Województwo: ${i.region}`)
  if (i.city) lines.push(`Miasto: ${i.city}`)
  if (i.owner_name) lines.push(`Właściciel/decyzyjny: ${i.owner_name}`)
  if (i.business_summary) lines.push(`Profil biznesowy: ${i.business_summary}`)
  lines.push(`\nTop match produkt ChM: ${i.top_product} (rodzina: ${i.family})`)
  lines.push(`\nWygeneruj pierwsze 1-2 zdania cold-emaila.`)
  return lines.join('\n')
}

async function main() {
  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Read Anthropic API key
  const { data: paramsRow } = await supabase
    .from('params')
    .select('anthropic_api_key')
    .limit(1)
    .maybeSingle()
  const anthropicKey =
    (paramsRow as { anthropic_api_key?: string } | null)?.anthropic_api_key
  if (!anthropicKey) throw new Error('anthropic_api_key missing у params')

  const anthropic = new Anthropic({ apiKey: anthropicKey })

  const cohort = JSON.parse(
    await fs.readFile('/tmp/sprint-n-cohort.json', 'utf-8'),
  ) as CohortEntry[]
  console.log(`B5 cold openers for ${cohort.length} entities`)

  const stats = {
    generated: 0,
    skipped: 0,
    error: 0,
    total_cost_usd: 0,
  }

  for (let i = 0; i < cohort.length; i++) {
    const e = cohort[i]!
    const tag = `[${i + 1}/${cohort.length}] ${e.name.slice(0, 40)}`

    // Skip якщо вже existeje opener (last 7 days)
    const existing = await supabase
      .from('cohort_cold_openers')
      .select('id, generated_at')
      .eq(e.type === 'client' ? 'client_id' : 'prospect_id', e.id)
      .gte('generated_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .limit(1)
      .maybeSingle()
    if (existing.data) {
      console.log(`${tag} SKIP (already has fresh opener)`)
      stats.skipped++
      continue
    }

    // Pull top match
    const { data: topMatch } = await supabase
      .from('matches')
      .select('product_id, combined_score, products!inner(name, family_id, taxonomy_families!inner(name_pl))')
      .eq(e.type === 'client' ? 'client_id' : 'prospect_id', e.id)
      .order('combined_score', { ascending: false })
      .limit(1)
      .maybeSingle()
    const tm = topMatch as
      | {
          product_id: string
          combined_score: number
          products: {
            name: string
            family_id: string
            taxonomy_families: { name_pl: string } | { name_pl: string }[]
          }
        }
      | null
    if (!tm) {
      console.log(`${tag} no top match — skip`)
      stats.skipped++
      continue
    }

    const familyNamePl = Array.isArray(tm.products.taxonomy_families)
      ? tm.products.taxonomy_families[0]?.name_pl
      : tm.products.taxonomy_families.name_pl

    // Pull city + owner if any
    let city: string | null = null
    let business_summary: string | null = null
    if (e.type === 'client') {
      const { data } = await supabase
        .from('clients')
        .select('city, business_profile')
        .eq('id', e.id)
        .maybeSingle()
      const c = data as { city: string | null; business_profile: { business_summary_pl?: string } | null } | null
      city = c?.city ?? null
      business_summary = c?.business_profile?.business_summary_pl ?? null
    } else {
      const { data } = await supabase
        .from('ceidg_prospects')
        .select('miejscowosc')
        .eq('id', e.id)
        .maybeSingle()
      city = (data as { miejscowosc: string | null } | null)?.miejscowosc ?? null
    }

    // Pull owner
    const { data: ownerLink } = await supabase
      .from('person_company_links')
      .select('rola, persons!inner(imie, nazwisko)')
      .eq(e.type === 'client' ? 'client_id' : 'prospect_id', e.id)
      .order('jest_decyzyjny', { ascending: false })
      .limit(1)
      .maybeSingle()
    const ol = ownerLink as
      | { rola: string; persons: { imie: string; nazwisko: string } | { imie: string; nazwisko: string }[] }
      | null
    const ownerPerson = ol?.persons
      ? Array.isArray(ol.persons)
        ? ol.persons[0]
        : ol.persons
      : null
    const owner_name = ownerPerson ? `${ownerPerson.imie} ${ownerPerson.nazwisko}` : null

    const userPrompt = buildUserPrompt({
      entity_name: e.name,
      legal_form: e.legal_form,
      region: e.region,
      top_product: tm.products.name,
      family: familyNamePl ?? '?',
      city,
      owner_name,
      business_summary,
    })

    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      })
      const opener = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('')
        .trim()

      const cost =
        response.usage.input_tokens * COST_INPUT +
        response.usage.output_tokens * COST_OUTPUT

      // Detect language: ua if owner name матє Cyrillic-stem otherwise pl
      const cyrillic = /[А-Яа-яЁё]/
      const language: 'pl' | 'ua' = ownerPerson && cyrillic.test(ownerPerson.imie + ownerPerson.nazwisko) ? 'ua' : 'pl'

      await supabase.from('cohort_cold_openers').insert({
        client_id: e.type === 'client' ? e.id : null,
        prospect_id: e.type === 'prospect' ? e.id : null,
        product_id: tm.product_id,
        family_id: tm.products.family_id,
        opener_text: opener,
        language,
        model_used: MODEL,
        cost_usd: cost,
      })

      stats.generated++
      stats.total_cost_usd += cost
      console.log(`${tag} ✅ "${opener.slice(0, 70)}..." cost=$${cost.toFixed(5)}`)
    } catch (err) {
      stats.error++
      console.error(`${tag} ERROR: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`\n━━━ B5 cold openers summary ━━━`)
  console.log(JSON.stringify(stats, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
