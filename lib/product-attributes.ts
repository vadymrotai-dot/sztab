// lib/product-attributes.ts
// Resolution helper: merge Family defaults + per-SKU overrides → final
// attribute view. Used by GET /api/products/[id]/attributes and хigien-scan.
//
// Precedence (top wins):
//   1. SKU value з override_locked=true   → ALWAYS, immutable від bulk
//   2. SKU value з override_locked=false  → wins over Family default
//   3. Family default (default_value)     → fills NULLs тільки

import type { SupabaseClient } from '@supabase/supabase-js'

export interface MergedAttribute {
  attr_key: string
  attr_type: string
  value: unknown
  source: 'family_default' | 'off' | 'gemini' | 'manual' | 'override'
  locked: boolean
  required: boolean
  /** True if value is null/empty AND key is in family.required_attributes */
  missing_required: boolean
}

export interface ResolvedAttributes {
  product_id: string
  family_id: string | null
  family_name_pl: string | null
  required_attributes: string[]
  attributes: MergedAttribute[]
  hygiene: {
    status: 'CLEAN' | 'DIRTY' | 'UNCHECKED'
    issues: { key: string; issue: string }[]
  }
}

interface FamilyAttrDefault {
  attr_key: string
  attr_type: string
  default_value: unknown
}

interface ProductAttrOverride {
  attr_key: string
  value: unknown
  source: 'family_default' | 'off' | 'gemini' | 'manual' | 'override'
  override_locked: boolean
}

interface FamilyRow {
  id: string
  name_pl: string
  required_attributes: string[]
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string' && v.trim() === '') return true
  if (Array.isArray(v) && v.length === 0) return true
  return false
}

export async function resolveProductAttributes(
  supabase: SupabaseClient,
  productId: string,
): Promise<ResolvedAttributes> {
  // 1. Product → family_id
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('id, family_id')
    .eq('id', productId)
    .single()
  if (pErr || !product) {
    throw new Error(`Product not found: ${productId}`)
  }

  const familyId: string | null = product.family_id ?? null

  // 2. Family info (if classified)
  let family: FamilyRow | null = null
  let defaults: FamilyAttrDefault[] = []
  if (familyId) {
    const { data: famRow } = await supabase
      .from('taxonomy_families')
      .select('id, name_pl, required_attributes')
      .eq('id', familyId)
      .single()
    if (famRow) {
      family = famRow as FamilyRow
      const { data: defRows } = await supabase
        .from('family_attribute_defaults')
        .select('attr_key, attr_type, default_value')
        .eq('family_id', familyId)
      defaults = (defRows ?? []) as FamilyAttrDefault[]
    }
  }

  // 3. Per-SKU overrides
  const { data: overrideRows } = await supabase
    .from('product_attributes')
    .select('attr_key, value, source, override_locked')
    .eq('sku_id', productId)
  const overrides = (overrideRows ?? []) as ProductAttrOverride[]
  const overrideByKey = new Map(overrides.map((o) => [o.attr_key, o]))

  // 4. Merge — start з all keys (defaults + overrides), apply precedence
  const allKeys = new Set<string>([
    ...defaults.map((d) => d.attr_key),
    ...overrides.map((o) => o.attr_key),
  ])

  const required = new Set(family?.required_attributes ?? [])
  const merged: MergedAttribute[] = []

  for (const key of allKeys) {
    const override = overrideByKey.get(key)
    const def = defaults.find((d) => d.attr_key === key)
    const attr_type = def?.attr_type ?? 'string'

    let value: unknown
    let source: MergedAttribute['source']
    let locked = false

    if (override && !isEmpty(override.value)) {
      value = override.value
      source = override.source
      locked = override.override_locked
    } else if (def && !isEmpty(def.default_value)) {
      value = def.default_value
      source = 'family_default'
    } else {
      value = null
      source = override?.source ?? 'family_default'
    }

    merged.push({
      attr_key: key,
      attr_type,
      value,
      source,
      locked,
      required: required.has(key),
      missing_required: required.has(key) && isEmpty(value),
    })
  }

  // Required keys without any row at all — also add as missing
  for (const reqKey of required) {
    if (!allKeys.has(reqKey)) {
      merged.push({
        attr_key: reqKey,
        attr_type: 'string',
        value: null,
        source: 'family_default',
        locked: false,
        required: true,
        missing_required: true,
      })
    }
  }

  merged.sort((a, b) => a.attr_key.localeCompare(b.attr_key))

  // 5. Hygiene
  const issues = merged
    .filter((m) => m.missing_required)
    .map((m) => ({ key: m.attr_key, issue: 'missing_required' }))

  const status: 'CLEAN' | 'DIRTY' | 'UNCHECKED' = !familyId
    ? 'UNCHECKED'
    : issues.length === 0
      ? 'CLEAN'
      : 'DIRTY'

  return {
    product_id: productId,
    family_id: familyId,
    family_name_pl: family?.name_pl ?? null,
    required_attributes: family?.required_attributes ?? [],
    attributes: merged,
    hygiene: { status, issues },
  }
}
