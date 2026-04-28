// scripts/seed-taxonomy.ts
// Sprint E / Commit 2: Idempotent seed для taxonomy core.
//
// Inserts:
//   - 11 Segments (Beverages, Alcohol, Dairy, Meat, Frozen, Bakery,
//     Dry Goods, Sauces, Sweets, Non-food, Vegetables & Salads)
//   - 33 Families (3 per segment)
//   - family_attribute_defaults (брак default value, тільки type registry)
//   - Maps 35 existing SKU → family_id via products.category string
//   - Backfills products.brand = 'Czudowa Marka' для всіх з NULL brand
//
// Idempotent: UNIQUE (segment_id, name_en) на families, ON CONFLICT DO NOTHING.
// Brand UPDATE з WHERE brand IS NULL — re-run safe.
//
// Run:
//   pnpm exec tsx scripts/seed-taxonomy.ts

import '@/lib/env'

import { executeManagementSQL } from '@/lib/supabase/management'

interface Segment {
  name_en: string
  name_pl: string
  ord: number
  families: Family[]
}

interface Family {
  name_en: string
  name_pl: string
  ord: number
  required_attributes: string[]
  validation_rules: Record<string, unknown>
  attr_types: Record<string, 'string' | 'number' | 'boolean' | 'enum' | 'array'>
}

// ───────── Schema definition ─────────

const beverageRules = {
  volume_ml: { type: 'number', min: 0, max: 5000 },
}
const alcoholRules = {
  volume_ml: { type: 'number', min: 0, max: 5000 },
  alcohol_pct: { type: 'number', min: 0, max: 100 },
}
const weightRules = { weight_g: { type: 'number', min: 0, max: 50000 } }
const fatRules = { fat_pct: { type: 'number', min: 0, max: 100 } }

const SEGMENTS: Segment[] = [
  {
    name_en: 'Beverages',
    name_pl: 'Napoje',
    ord: 1,
    families: [
      {
        name_en: 'Soft Drinks',
        name_pl: 'Napoje gazowane',
        ord: 1,
        required_attributes: ['brand', 'volume_ml', 'packaging_type'],
        validation_rules: beverageRules,
        attr_types: { brand: 'string', volume_ml: 'number', packaging_type: 'enum' },
      },
      {
        name_en: 'Juices & Nectars',
        name_pl: 'Soki i nektary',
        ord: 2,
        required_attributes: ['brand', 'volume_ml', 'packaging_type'],
        validation_rules: beverageRules,
        attr_types: { brand: 'string', volume_ml: 'number', packaging_type: 'enum' },
      },
      {
        name_en: 'Water',
        name_pl: 'Woda',
        ord: 3,
        required_attributes: ['brand', 'volume_ml', 'packaging_type'],
        validation_rules: beverageRules,
        attr_types: { brand: 'string', volume_ml: 'number', packaging_type: 'enum' },
      },
    ],
  },
  {
    name_en: 'Alcohol',
    name_pl: 'Alkohole',
    ord: 2,
    families: [
      {
        name_en: 'Beer',
        name_pl: 'Piwo',
        ord: 1,
        required_attributes: ['brand', 'volume_ml', 'alcohol_pct'],
        validation_rules: alcoholRules,
        attr_types: { brand: 'string', volume_ml: 'number', alcohol_pct: 'number' },
      },
      {
        name_en: 'Wine',
        name_pl: 'Wino',
        ord: 2,
        required_attributes: ['brand', 'volume_ml', 'alcohol_pct'],
        validation_rules: alcoholRules,
        attr_types: { brand: 'string', volume_ml: 'number', alcohol_pct: 'number' },
      },
      {
        name_en: 'Spirits',
        name_pl: 'Alkohole mocne',
        ord: 3,
        required_attributes: ['brand', 'volume_ml', 'alcohol_pct'],
        validation_rules: alcoholRules,
        attr_types: { brand: 'string', volume_ml: 'number', alcohol_pct: 'number' },
      },
    ],
  },
  {
    name_en: 'Dairy',
    name_pl: 'Nabiał',
    ord: 3,
    families: [
      {
        name_en: 'Milk & Cream',
        name_pl: 'Mleko i śmietana',
        ord: 1,
        required_attributes: ['brand', 'weight_g', 'fat_pct'],
        validation_rules: { ...weightRules, ...fatRules },
        attr_types: { brand: 'string', weight_g: 'number', fat_pct: 'number' },
      },
      {
        name_en: 'Cheese',
        name_pl: 'Sery',
        ord: 2,
        required_attributes: ['brand', 'weight_g', 'fat_pct'],
        validation_rules: { ...weightRules, ...fatRules },
        attr_types: { brand: 'string', weight_g: 'number', fat_pct: 'number' },
      },
      {
        name_en: 'Yogurt & Desserts',
        name_pl: 'Jogurty i desery',
        ord: 3,
        required_attributes: ['brand', 'weight_g', 'fat_pct'],
        validation_rules: { ...weightRules, ...fatRules },
        attr_types: { brand: 'string', weight_g: 'number', fat_pct: 'number' },
      },
    ],
  },
  {
    name_en: 'Meat',
    name_pl: 'Mięso i Wędliny',
    ord: 4,
    families: [
      {
        name_en: 'Fresh Meat',
        name_pl: 'Mięso świeże',
        ord: 1,
        required_attributes: ['brand', 'weight_g', 'type'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', type: 'enum' },
      },
      {
        name_en: 'Cured & Charcuterie',
        name_pl: 'Wędliny',
        ord: 2,
        required_attributes: ['brand', 'weight_g', 'type'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', type: 'enum' },
      },
      {
        name_en: 'Poultry',
        name_pl: 'Drób',
        ord: 3,
        required_attributes: ['brand', 'weight_g', 'type'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', type: 'enum' },
      },
    ],
  },
  {
    name_en: 'Frozen',
    name_pl: 'Mrożonki',
    ord: 5,
    families: [
      {
        name_en: 'Frozen Vegetables',
        name_pl: 'Mrożone warzywa',
        ord: 1,
        required_attributes: ['brand', 'weight_g', 'packaging_type'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', packaging_type: 'enum' },
      },
      {
        name_en: 'Frozen Meat & Fish',
        name_pl: 'Mrożone mięso i ryby',
        ord: 2,
        required_attributes: ['brand', 'weight_g', 'packaging_type'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', packaging_type: 'enum' },
      },
      {
        name_en: 'Frozen Ready Meals',
        name_pl: 'Dania gotowe mrożone',
        ord: 3,
        required_attributes: ['brand', 'weight_g', 'packaging_type'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', packaging_type: 'enum' },
      },
    ],
  },
  {
    name_en: 'Bakery',
    name_pl: 'Pieczywo',
    ord: 6,
    families: [
      {
        name_en: 'Bread',
        name_pl: 'Chleb',
        ord: 1,
        required_attributes: ['brand', 'weight_g', 'ingredients'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', ingredients: 'array' },
      },
      {
        name_en: 'Pastries & Cakes',
        name_pl: 'Ciasta i ciastka',
        ord: 2,
        required_attributes: ['brand', 'weight_g', 'ingredients'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', ingredients: 'array' },
      },
      {
        name_en: 'Frozen Bakery Dough',
        name_pl: 'Mrożone ciasto',
        ord: 3,
        required_attributes: ['brand', 'weight_g', 'ingredients'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', ingredients: 'array' },
      },
    ],
  },
  {
    name_en: 'Dry Goods',
    name_pl: 'Suche / Sypkie',
    ord: 7,
    families: [
      {
        name_en: 'Pasta & Rice',
        name_pl: 'Makarony i ryż',
        ord: 1,
        required_attributes: ['brand', 'weight_g', 'ingredients'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', ingredients: 'array' },
      },
      {
        name_en: 'Flour & Baking',
        name_pl: 'Mąka i pieczenie',
        ord: 2,
        required_attributes: ['brand', 'weight_g', 'ingredients'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', ingredients: 'array' },
      },
      {
        name_en: 'Cereals & Oats',
        name_pl: 'Płatki i kasze',
        ord: 3,
        required_attributes: ['brand', 'weight_g', 'ingredients'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', ingredients: 'array' },
      },
    ],
  },
  {
    name_en: 'Sauces & Condiments',
    name_pl: 'Sosy i Przyprawy',
    ord: 8,
    families: [
      {
        name_en: 'Cooking Sauces',
        name_pl: 'Sosy do gotowania',
        ord: 1,
        required_attributes: ['brand', 'volume_ml', 'ingredients'],
        validation_rules: beverageRules,
        attr_types: { brand: 'string', volume_ml: 'number', ingredients: 'array' },
      },
      {
        name_en: 'Oils & Vinegars',
        name_pl: 'Oleje i ocet',
        ord: 2,
        required_attributes: ['brand', 'volume_ml', 'ingredients'],
        validation_rules: beverageRules,
        attr_types: { brand: 'string', volume_ml: 'number', ingredients: 'array' },
      },
      {
        name_en: 'Spices & Seasonings',
        name_pl: 'Przyprawy',
        ord: 3,
        required_attributes: ['brand', 'weight_g', 'ingredients'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', ingredients: 'array' },
      },
    ],
  },
  {
    name_en: 'Sweet & Snacks',
    name_pl: 'Słodycze i Przekąski',
    ord: 9,
    families: [
      {
        name_en: 'Chocolate & Candy',
        name_pl: 'Czekolada i cukierki',
        ord: 1,
        required_attributes: ['brand', 'weight_g', 'ingredients'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', ingredients: 'array' },
      },
      {
        name_en: 'Salty Snacks',
        name_pl: 'Słone przekąski',
        ord: 2,
        required_attributes: ['brand', 'weight_g', 'ingredients'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', ingredients: 'array' },
      },
      {
        name_en: 'Cookies & Wafers',
        name_pl: 'Ciastka i wafle',
        ord: 3,
        required_attributes: ['brand', 'weight_g', 'ingredients'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', ingredients: 'array' },
      },
    ],
  },
  {
    name_en: 'Non-food',
    name_pl: 'Chemia / Opakowania / Jednorazówki',
    ord: 10,
    families: [
      {
        name_en: 'Cleaning Chemicals',
        name_pl: 'Środki czystości',
        ord: 1,
        required_attributes: ['brand', 'packaging_type'],
        validation_rules: {},
        attr_types: { brand: 'string', packaging_type: 'enum' },
      },
      {
        name_en: 'Packaging Materials',
        name_pl: 'Opakowania',
        ord: 2,
        required_attributes: ['brand', 'packaging_type'],
        validation_rules: {},
        attr_types: { brand: 'string', packaging_type: 'enum' },
      },
      {
        name_en: 'Disposables',
        name_pl: 'Jednorazówki',
        ord: 3,
        required_attributes: ['brand', 'packaging_type'],
        validation_rules: {},
        attr_types: { brand: 'string', packaging_type: 'enum' },
      },
    ],
  },
  {
    name_en: 'Vegetables & Salads',
    name_pl: 'Warzywa i Sałatki',
    ord: 11,
    families: [
      {
        name_en: 'Kiszonki',
        name_pl: 'Kiszonki',
        ord: 1,
        required_attributes: ['brand', 'weight_g', 'packaging_type'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', packaging_type: 'enum' },
      },
      {
        name_en: 'Salatki gotowe',
        name_pl: 'Sałatki gotowe',
        ord: 2,
        required_attributes: ['brand', 'weight_g', 'packaging_type'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', packaging_type: 'enum' },
      },
      {
        name_en: 'Marynaty',
        name_pl: 'Marynaty',
        ord: 3,
        required_attributes: ['brand', 'weight_g', 'packaging_type'],
        validation_rules: weightRules,
        attr_types: { brand: 'string', weight_g: 'number', packaging_type: 'enum' },
      },
    ],
  },
]

// Map existing products.category string → (segment_en, family_en)
const CATEGORY_TO_FAMILY: Record<string, { segment: string; family: string }> = {
  buraki_clean_label: { segment: 'Vegetables & Salads', family: 'Salatki gotowe' },
  kiszonki_dodatki: { segment: 'Vegetables & Salads', family: 'Kiszonki' },
  kiszonki_kapusty: { segment: 'Vegetables & Salads', family: 'Kiszonki' },
  ogorki_kiszone: { segment: 'Vegetables & Salads', family: 'Kiszonki' },
  pomidory: { segment: 'Vegetables & Salads', family: 'Marynaty' },
  salatka_baklazan: { segment: 'Vegetables & Salads', family: 'Salatki gotowe' },
  salatki_gotowe: { segment: 'Vegetables & Salads', family: 'Salatki gotowe' },
  surowka_marchew: { segment: 'Vegetables & Salads', family: 'Salatki gotowe' },
  surowki_marynowane: { segment: 'Vegetables & Salads', family: 'Marynaty' },
}

function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

function buildSeedSQL(): string {
  const lines: string[] = []

  // Segments
  lines.push('-- Segments')
  for (const seg of SEGMENTS) {
    lines.push(
      `INSERT INTO taxonomy_segments (name_en, name_pl, ord) VALUES (${quote(seg.name_en)}, ${quote(seg.name_pl)}, ${seg.ord}) ON CONFLICT (name_en) DO NOTHING;`,
    )
  }

  // Families
  lines.push('-- Families')
  for (const seg of SEGMENTS) {
    for (const fam of seg.families) {
      const reqAttrs = `ARRAY[${fam.required_attributes.map(quote).join(',')}]::TEXT[]`
      const rules = quote(JSON.stringify(fam.validation_rules))
      lines.push(
        `INSERT INTO taxonomy_families (segment_id, name_en, name_pl, ord, required_attributes, validation_rules)
         SELECT s.id, ${quote(fam.name_en)}, ${quote(fam.name_pl)}, ${fam.ord}, ${reqAttrs}, ${rules}::jsonb
         FROM taxonomy_segments s WHERE s.name_en = ${quote(seg.name_en)}
         ON CONFLICT (segment_id, name_en) DO NOTHING;`,
      )
    }
  }

  // Family attribute defaults (type registry only; default_value = NULL — no implicit defaults цей sprint)
  lines.push('-- family_attribute_defaults (type registry)')
  for (const seg of SEGMENTS) {
    for (const fam of seg.families) {
      for (const [key, attrType] of Object.entries(fam.attr_types)) {
        lines.push(
          `INSERT INTO family_attribute_defaults (family_id, attr_key, attr_type, default_value)
           SELECT f.id, ${quote(key)}, ${quote(attrType)}, NULL
           FROM taxonomy_families f
           JOIN taxonomy_segments s ON s.id = f.segment_id
           WHERE s.name_en = ${quote(seg.name_en)} AND f.name_en = ${quote(fam.name_en)}
           ON CONFLICT (family_id, attr_key) DO NOTHING;`,
        )
      }
    }
  }

  // Map existing products.category → family_id (only where family_id IS NULL = idempotent)
  lines.push('-- Map products.category → family_id')
  for (const [cat, { segment, family }] of Object.entries(CATEGORY_TO_FAMILY)) {
    lines.push(
      `UPDATE products SET family_id = (
         SELECT f.id FROM taxonomy_families f
         JOIN taxonomy_segments s ON s.id = f.segment_id
         WHERE s.name_en = ${quote(segment)} AND f.name_en = ${quote(family)}
       )
       WHERE category = ${quote(cat)} AND family_id IS NULL;`,
    )
  }

  // Backfill brand
  lines.push('-- Backfill brand for Czudowa Marka SKU (supplier match)')
  lines.push(
    `UPDATE products SET brand = 'Czudowa Marka'
     WHERE brand IS NULL
       AND supplier_id = (SELECT id FROM suppliers WHERE name = 'Czudowa Marka' LIMIT 1);`,
  )

  return lines.join('\n')
}

async function main() {
  console.log('\n══════ Seed Taxonomy ══════\n')

  const sql = buildSeedSQL()
  console.log(`[SEED] Built SQL: ${sql.length} bytes, ${sql.split('\n').length} statements`)

  const result = await executeManagementSQL(sql)
  if (!result.ok) {
    console.error(`❌ Seed failed (HTTP ${result.status}):`, result.error)
    process.exit(1)
  }
  console.log('✓ Seed SQL applied')

  // Verify
  const verify = await executeManagementSQL(`
    SELECT
      (SELECT COUNT(*) FROM taxonomy_segments)::int AS segments,
      (SELECT COUNT(*) FROM taxonomy_families)::int AS families,
      (SELECT COUNT(*) FROM family_attribute_defaults)::int AS defaults,
      (SELECT COUNT(*) FROM products WHERE family_id IS NOT NULL)::int AS skus_classified,
      (SELECT COUNT(*) FROM products WHERE brand IS NOT NULL)::int AS skus_branded,
      (SELECT COUNT(*) FROM products)::int AS skus_total
  `)
  if (!verify.ok || !verify.rows?.[0]) {
    console.error('❌ Verify query failed:', verify.error)
    process.exit(1)
  }
  const row = verify.rows[0] as Record<string, number>

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('SEED RESULT')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Segments:               ${row.segments} / 11`)
  console.log(`Families:               ${row.families} / 33`)
  console.log(`Attribute defaults:     ${row.defaults}`)
  console.log(`SKU classified:         ${row.skus_classified} / ${row.skus_total}`)
  console.log(`SKU з brand:            ${row.skus_branded} / ${row.skus_total}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (row.segments !== 11 || row.families !== 33) {
    console.error('⚠️  Counts off — expected 11/33')
    process.exit(2)
  }
}

main().catch((err) => {
  console.error('❌ Crashed:', err)
  process.exit(1)
})
