// scripts/seed-family-target-pkd.ts
// Sprint F / Commit 2: Seed target_pkd_2025 для 33 Families.
//
// Logic:
//   1. Hardcoded mapping (segment_en, family_en) → list of PKD-2025 codes
//      (з dots, e.g. "47.25.Z"). Choices grounded в official PKD descriptions
//      і HoReCa channel logic — кожна Family пов'язана з retail/wholesale/
//      gastronomy кодами які найчастіше купують це від broker.
//   2. Update taxonomy_families.target_pkd_2025 (TEXT[]).
//   3. Derive target_pkd_2007 from pkd_mapping table — JOIN via 2025 → 2007.
//      pkd_mapping current state: 1:1 placeholder (Sprint E commit 3) — мapі
//      identical, але query через mapping столик правильно представляє
//      schema dependency.
//
// Idempotent: UPDATE based на segment+family identity, full rewrite OK
// (per-Family human-curated targets — це authoritative source).
//
// Run:
//   pnpm exec tsx scripts/seed-family-target-pkd.ts

import '@/lib/env'

import { executeManagementSQL } from '@/lib/supabase/management'

interface FamilyTarget {
  segment_en: string
  family_en: string
  pkd_2025: string[]
}

const FAMILY_TARGETS: FamilyTarget[] = [
  // ─── Beverages ───
  {
    segment_en: 'Beverages',
    family_en: 'Soft Drinks',
    pkd_2025: ['47.25.Z', '47.11.Z', '47.29.Z', '56.10.A', '56.30.Z', '46.34.B'],
  },
  {
    segment_en: 'Beverages',
    family_en: 'Juices & Nectars',
    pkd_2025: ['47.25.Z', '47.21.Z', '47.11.Z', '47.29.Z', '56.10.A', '56.30.Z', '46.34.B'],
  },
  {
    segment_en: 'Beverages',
    family_en: 'Water',
    pkd_2025: ['47.25.Z', '47.11.Z', '56.10.A', '56.30.Z', '46.34.B'],
  },
  // ─── Alcohol ───
  {
    segment_en: 'Alcohol',
    family_en: 'Beer',
    pkd_2025: ['47.25.Z', '56.10.A', '56.30.Z', '46.34.A'],
  },
  {
    segment_en: 'Alcohol',
    family_en: 'Wine',
    pkd_2025: ['47.25.Z', '56.10.A', '56.30.Z', '46.34.A'],
  },
  {
    segment_en: 'Alcohol',
    family_en: 'Spirits',
    pkd_2025: ['47.25.Z', '56.10.A', '56.30.Z', '46.34.A'],
  },
  // ─── Dairy ───
  {
    segment_en: 'Dairy',
    family_en: 'Milk & Cream',
    pkd_2025: ['47.21.Z', '47.29.Z', '47.11.Z', '56.10.A', '46.33.Z'],
  },
  {
    segment_en: 'Dairy',
    family_en: 'Cheese',
    pkd_2025: ['47.29.Z', '47.11.Z', '56.10.A', '46.33.Z'],
  },
  {
    segment_en: 'Dairy',
    family_en: 'Yogurt & Desserts',
    pkd_2025: ['47.21.Z', '47.29.Z', '47.11.Z', '56.10.A', '46.33.Z'],
  },
  // ─── Meat ───
  {
    segment_en: 'Meat',
    family_en: 'Fresh Meat',
    pkd_2025: ['47.22.Z', '47.11.Z', '56.10.A', '56.21.Z', '46.32.Z'],
  },
  {
    segment_en: 'Meat',
    family_en: 'Cured & Charcuterie',
    pkd_2025: ['47.22.Z', '47.29.Z', '47.11.Z', '46.32.Z'],
  },
  {
    segment_en: 'Meat',
    family_en: 'Poultry',
    pkd_2025: ['47.22.Z', '47.11.Z', '56.10.A', '46.32.Z'],
  },
  // ─── Frozen ───
  {
    segment_en: 'Frozen',
    family_en: 'Frozen Vegetables',
    pkd_2025: ['47.21.Z', '47.29.Z', '47.11.Z', '56.10.A', '56.21.Z'],
  },
  {
    segment_en: 'Frozen',
    family_en: 'Frozen Meat & Fish',
    pkd_2025: ['47.22.Z', '47.23.Z', '47.11.Z', '56.10.A', '56.21.Z'],
  },
  {
    segment_en: 'Frozen',
    family_en: 'Frozen Ready Meals',
    pkd_2025: ['47.11.Z', '47.29.Z', '56.10.A', '56.21.Z', '46.39.Z'],
  },
  // ─── Bakery ───
  {
    segment_en: 'Bakery',
    family_en: 'Bread',
    pkd_2025: ['47.24.Z', '47.11.Z', '56.10.A', '56.30.Z', '46.36.Z'],
  },
  {
    segment_en: 'Bakery',
    family_en: 'Pastries & Cakes',
    pkd_2025: ['47.24.Z', '47.11.Z', '56.10.A', '56.30.Z', '46.36.Z'],
  },
  {
    segment_en: 'Bakery',
    family_en: 'Frozen Bakery Dough',
    pkd_2025: ['47.11.Z', '56.10.A', '56.21.Z', '46.36.Z'],
  },
  // ─── Dry Goods ───
  {
    segment_en: 'Dry Goods',
    family_en: 'Pasta & Rice',
    pkd_2025: ['47.11.Z', '47.29.Z', '56.10.A', '56.29.Z', '46.39.Z'],
  },
  {
    segment_en: 'Dry Goods',
    family_en: 'Flour & Baking',
    pkd_2025: ['47.11.Z', '47.29.Z', '46.21.Z', '46.39.Z'],
  },
  {
    segment_en: 'Dry Goods',
    family_en: 'Cereals & Oats',
    pkd_2025: ['47.11.Z', '47.29.Z', '56.10.A', '46.39.Z'],
  },
  // ─── Sauces & Condiments ───
  {
    segment_en: 'Sauces & Condiments',
    family_en: 'Cooking Sauces',
    pkd_2025: ['47.11.Z', '47.29.Z', '56.10.A', '56.29.Z', '46.39.Z'],
  },
  {
    segment_en: 'Sauces & Condiments',
    family_en: 'Oils & Vinegars',
    pkd_2025: ['47.11.Z', '47.29.Z', '56.10.A', '46.33.Z', '46.39.Z'],
  },
  {
    segment_en: 'Sauces & Condiments',
    family_en: 'Spices & Seasonings',
    pkd_2025: ['47.11.Z', '47.29.Z', '56.10.A', '46.37.Z', '46.39.Z'],
  },
  // ─── Sweet & Snacks ───
  {
    segment_en: 'Sweet & Snacks',
    family_en: 'Chocolate & Candy',
    pkd_2025: ['47.24.Z', '47.11.Z', '47.29.Z', '56.30.Z', '46.36.Z'],
  },
  {
    segment_en: 'Sweet & Snacks',
    family_en: 'Salty Snacks',
    pkd_2025: ['47.11.Z', '47.29.Z', '56.30.Z', '56.10.A', '46.39.Z'],
  },
  {
    segment_en: 'Sweet & Snacks',
    family_en: 'Cookies & Wafers',
    pkd_2025: ['47.24.Z', '47.11.Z', '56.30.Z', '56.10.A', '46.36.Z'],
  },
  // ─── Non-food ───
  // Wąski targeting: non-food broker products в HoReCa в основному gastronomy
  // venues (cleaning, packaging, disposables — kitchens, takeaway).
  {
    segment_en: 'Non-food',
    family_en: 'Cleaning Chemicals',
    pkd_2025: ['56.10.A', '56.21.Z', '56.29.Z', '56.30.Z'],
  },
  {
    segment_en: 'Non-food',
    family_en: 'Packaging Materials',
    pkd_2025: ['56.10.A', '56.21.Z', '56.29.Z', '56.30.Z'],
  },
  {
    segment_en: 'Non-food',
    family_en: 'Disposables',
    pkd_2025: ['56.10.A', '56.21.Z', '56.29.Z', '56.30.Z'],
  },
  // ─── Vegetables & Salads (Czudowa Marka — broad food channel) ───
  {
    segment_en: 'Vegetables & Salads',
    family_en: 'Kiszonki',
    pkd_2025: ['47.21.Z', '47.29.Z', '47.11.Z', '56.10.A', '56.21.Z', '56.29.Z', '46.31.Z'],
  },
  {
    segment_en: 'Vegetables & Salads',
    family_en: 'Salatki gotowe',
    pkd_2025: ['47.11.Z', '47.29.Z', '56.10.A', '56.21.Z', '56.29.Z', '46.39.Z'],
  },
  {
    segment_en: 'Vegetables & Salads',
    family_en: 'Marynaty',
    pkd_2025: ['47.21.Z', '47.29.Z', '47.11.Z', '56.10.A', '46.31.Z', '46.39.Z'],
  },
]

function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

async function main() {
  console.log('\n══════ Seed Family target_pkd ══════\n')

  if (FAMILY_TARGETS.length !== 33) {
    console.error(`❌ Expected 33 family targets, got ${FAMILY_TARGETS.length}`)
    process.exit(1)
  }

  // 1. Update target_pkd_2025
  const updates: string[] = []
  for (const t of FAMILY_TARGETS) {
    const arr = `ARRAY[${t.pkd_2025.map(quote).join(',')}]::TEXT[]`
    updates.push(
      `UPDATE taxonomy_families f
       SET target_pkd_2025 = ${arr}
       FROM taxonomy_segments s
       WHERE f.segment_id = s.id
         AND s.name_en = ${quote(t.segment_en)}
         AND f.name_en = ${quote(t.family_en)};`,
    )
  }

  // 2. Derive target_pkd_2007 from pkd_mapping. Since current mapping = 1:1
  // placeholder, computed array == target_pkd_2025. But going through mapping
  // table makes schema dependency explicit and works коли GUS publishes real
  // 2007↔2025 transition.
  updates.push(`
    UPDATE taxonomy_families f
    SET target_pkd_2007 = COALESCE((
      SELECT array_agg(DISTINCT m.pkd_2007_code)
      FROM pkd_mapping m
      WHERE m.pkd_2025_code = ANY(f.target_pkd_2025)
    ), '{}'::TEXT[])
    WHERE array_length(f.target_pkd_2025, 1) > 0;
  `)

  const sql = updates.join('\n')
  console.log(`[SEED] Built SQL: ${sql.length} bytes, ${FAMILY_TARGETS.length} family updates`)

  const result = await executeManagementSQL(sql)
  if (!result.ok) {
    console.error(`❌ SQL failed: ${result.error}`)
    process.exit(1)
  }
  console.log('✓ target_pkd_2025 + target_pkd_2007 updated')

  // 3. Verify
  const verify = await executeManagementSQL(`
    SELECT
      COUNT(*)::int AS total_families,
      COUNT(*) FILTER (WHERE array_length(target_pkd_2025, 1) > 0)::int AS with_2025,
      COUNT(*) FILTER (WHERE array_length(target_pkd_2007, 1) > 0)::int AS with_2007,
      AVG(COALESCE(array_length(target_pkd_2025, 1), 0))::numeric(4,1) AS avg_codes
    FROM taxonomy_families
  `)
  if (!verify.ok || !verify.rows?.[0]) {
    console.error('❌ Verify failed')
    process.exit(1)
  }
  const r = verify.rows[0] as Record<string, number>

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('FAMILY target_pkd seed result')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Total families:       ${r.total_families}`)
  console.log(`з target_pkd_2025:    ${r.with_2025} / 33`)
  console.log(`з target_pkd_2007:    ${r.with_2007} / 33`)
  console.log(`Avg PKD codes/family: ${r.avg_codes}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (r.with_2025 !== 33 || r.with_2007 !== 33) {
    console.error('⚠️  Counts off — expected 33/33')
    process.exit(2)
  }
}

main().catch((err) => {
  console.error('❌ Crashed:', err)
  process.exit(1)
})
