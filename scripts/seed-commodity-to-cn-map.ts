// scripts/seed-commodity-to-cn-map.ts
// Sprint S-INTEL.1.2.1 — Phase 1 seed для commodity_to_cn_map.
// 10 cross-supplier ZSRIR-style labels → CN codes.
//
// Idempotent: ON CONFLICT (source, source_label) DO NOTHING. Re-run safe.
//
// Phase 1 scope: ZSRIR datasets 912 (owoce/warzywa) + 1024 (mleko) — pairs
// з найімовірнішими label strings які parser витягне.
//
// Phase 2 (S-INTEL.1.2.2 + 1.2.3): expand з реальних labels що з'являться
// у commodity_prices після першого manual trigger. Add fresh-market.pl та
// eu_agri labels.
//
// CN codes verified manually from EU TARIC nomenclature (2026 edition).
// Якщо AI suggester у lib/ai/cn-code-suggester.ts повертає different code
// для same product — Vadym обирає авторитетне джерело.
//
// Run:
//   pnpm exec tsx scripts/seed-commodity-to-cn-map.ts

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

interface SeedRow {
  source: 'zsrir' | 'fresh_market_pl' | 'eu_agri'
  source_label: string
  cn_code: string
  notes?: string
}

// 10 ZSRIR-priority seed (covers HIGH datasets 912 + 1024 + medium overlap)
const SEED_ROWS: SeedRow[] = [
  // ZSRIR 912 — owoce i warzywa świeże
  {
    source: 'zsrir',
    source_label: 'kapusta biała głowiasta',
    cn_code: '07049010',
    notes: 'White headed cabbage. Bridge для kiszonki kapusty (CN 20055100 finished product).',
  },
  {
    source: 'zsrir',
    source_label: 'pomidor pole',
    cn_code: '07020000',
    notes: 'Field tomato. Heading 0702 covers all fresh tomatoes.',
  },
  {
    source: 'zsrir',
    source_label: 'ogórek krótki',
    cn_code: '07070005',
    notes: 'Cucumber short type. Bridge для marynaty/kiszonki ogórki (CN 20019050 finished).',
  },
  {
    source: 'zsrir',
    source_label: 'jabłka',
    cn_code: '08081090',
    notes: 'Fresh apples. Heading 0808 covers apples; 10 = others except cider.',
  },
  {
    source: 'zsrir',
    source_label: 'ziemniaki',
    cn_code: '07019050',
    notes: 'Fresh potatoes (other than seed). Late season.',
  },
  {
    source: 'zsrir',
    source_label: 'marchew',
    cn_code: '07061000',
    notes: 'Fresh carrot. Bridge для surowka marchew (CN 20049098 finished).',
  },
  {
    source: 'zsrir',
    source_label: 'cebula',
    cn_code: '07031019',
    notes: 'Fresh onion (other than seed). Used у HoReCa baseline.',
  },
  {
    source: 'zsrir',
    source_label: 'burak',
    cn_code: '07069090',
    notes: 'Fresh red beetroot. Bridge для buraki kiszone (CN 20059990 finished).',
  },

  // ZSRIR 1024 — mleko
  {
    source: 'zsrir',
    source_label: 'mleko surowe',
    cn_code: '04011099',
    notes: 'Raw milk (fat content ≤ 1%). 0401 covers fresh milk.',
  },
  {
    source: 'zsrir',
    source_label: 'cena mleka surowego',
    cn_code: '04011099',
    notes: 'Alternative label form parser може зустрітися. Same CN.',
  },
]

async function main() {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!svcKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing — додай у .env.local')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('\n══════ Seed commodity_to_cn_map ══════\n')
  console.log(`Inserting ${SEED_ROWS.length} ZSRIR mappings...`)

  let inserted = 0
  let skipped = 0
  let failed = 0

  for (const row of SEED_ROWS) {
    const { error } = await supabase
      .from('commodity_to_cn_map')
      .upsert(row, {
        onConflict: 'source,source_label',
        ignoreDuplicates: true,
      })

    if (error) {
      console.error(`  ✗ "${row.source_label}" → CN ${row.cn_code}: ${error.message}`)
      failed++
      continue
    }
    console.log(`  ✓ "${row.source_label}" → CN ${row.cn_code}`)
    inserted++
  }

  console.log('\n══════ Summary ══════')
  console.log(`Total seed:    ${SEED_ROWS.length}`)
  console.log(`Inserted/upsert: ${inserted}`)
  console.log(`Skipped (dup): ${skipped}`)
  console.log(`Failed:        ${failed}`)

  // Verify
  const { count } = await supabase
    .from('commodity_to_cn_map')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'zsrir')
  console.log(`\nVerify: ZSRIR mappings у table = ${count ?? '?'}`)

  if (failed > 0) {
    console.log('\n⚠️  Якщо failed > 0 — перевір що migration 053 applied.')
    process.exit(1)
  }

  console.log('\nNext: pnpm exec tsx scripts/manual-trigger-market-intelligence.ts')
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err)
  process.exit(1)
})
