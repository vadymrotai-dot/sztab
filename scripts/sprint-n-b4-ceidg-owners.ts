// scripts/sprint-n-b4-ceidg-owners.ts
// Sprint N Phase B4 — CEIDG owner extraction для prospects у cohort.
// Public data (CEIDG free public registry — НЕ RODO restricted).

import '@/lib/env'
import * as fs from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

interface CohortEntry {
  id: string
  type: 'client' | 'prospect'
  name: string
  nip: string
}

async function main() {
  const url = 'https://pxovjyxsktxdbovmybxz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cohort = JSON.parse(
    await fs.readFile('/tmp/sprint-n-cohort.json', 'utf-8'),
  ) as CohortEntry[]

  const prospects = cohort.filter((e) => e.type === 'prospect')
  console.log(`CEIDG owner extraction for ${prospects.length} prospects`)

  let created = 0
  let alreadyHad = 0
  let noOwnerData = 0

  for (const e of prospects) {
    // Check if person link already exists для цього prospect
    const { data: existing } = await supabase
      .from('person_company_links')
      .select('id')
      .eq('prospect_id', e.id)
      .ilike('rola', 'właściciel')
      .limit(1)
    if (existing && existing.length > 0) {
      alreadyHad++
      continue
    }

    // Pull owner from CEIDG raw_data
    const { data: row } = await supabase
      .from('ceidg_prospects')
      .select('owner_name, raw_data, telefon, email')
      .eq('id', e.id)
      .single()
    const r = row as
      | {
          owner_name: string | null
          raw_data: Record<string, unknown> | null
          telefon: string | null
          email: string | null
        }
      | null
    if (!r) continue

    // CEIDG owner lives у raw_data.wlasciciel.imie/nazwisko or owner_name
    const wlasciciel =
      (r.raw_data as { wlasciciel?: { imie?: string; nazwisko?: string } } | null)
        ?.wlasciciel
    let imie: string | null = null
    let nazwisko: string | null = null
    if (wlasciciel?.imie && wlasciciel.nazwisko) {
      imie = wlasciciel.imie
      nazwisko = wlasciciel.nazwisko
    } else if (r.owner_name) {
      // Fallback split
      const parts = r.owner_name.trim().split(/\s+/)
      if (parts.length >= 2) {
        imie = parts[0]!
        nazwisko = parts.slice(1).join(' ')
      }
    }

    if (!imie || !nazwisko) {
      noOwnerData++
      console.log(`  ${e.name} (${e.nip}) — no owner data`)
      continue
    }

    // Create person + link
    const { data: pIns } = await supabase
      .from('persons')
      .insert({
        imie,
        nazwisko,
        telefon_komorkowy: r.telefon,
        email_glowny: r.email,
        zrodla_pol: { imie: 'CEIDG', nazwisko: 'CEIDG', telefon: 'CEIDG', email: 'CEIDG' },
      })
      .select('id')
      .single()

    if (pIns) {
      await supabase.from('person_company_links').insert({
        person_id: (pIns as { id: string }).id,
        prospect_id: e.id,
        rola: 'Właściciel',
        jest_decyzyjny: true,
        zrodlo: 'CEIDG',
      })
      created++
      console.log(`  ✅ ${imie} ${nazwisko} → ${e.name}`)
    }
  }

  console.log(`\n━━━ B4 CEIDG owners summary ━━━`)
  console.log(`Created:      ${created}`)
  console.log(`Already had:  ${alreadyHad}`)
  console.log(`No data:      ${noOwnerData}`)
  console.log(`Total prospects in cohort: ${prospects.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
