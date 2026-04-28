-- 023_taxonomy_core.sql
-- Sprint E / Commit 1: Matching Engine Taxonomy foundation.
--
-- Hierarchy: Segments → Families → Classes (4-th tier, optional, schema-only)
-- Attribute resolution rules (top wins):
--   1. SKU explicit з override_locked=true  → ALWAYS wins, immutable від bulk
--   2. SKU explicit з override_locked=false → wins over Family default
--   3. Family default                       → fills NULLs тільки
-- PKD dual-mapping: 2007 (legacy GUS) + 2025 (revised). pkd_mapping links them.
-- Hygiene: per-SKU computed CLEAN/DIRTY status updated by nightly cron.
--
-- products.category column kept (legacy free-text). New family_id is soft-link.
-- Cleanup of category — окремий sprint.
--
-- Idempotent. Reversible: DROP TABLE statements at bottom (commented out).

-- ─────── 1. taxonomy_segments ───────
CREATE TABLE IF NOT EXISTS taxonomy_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_pl TEXT NOT NULL,
  name_en TEXT NOT NULL,
  ord INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name_en)
);
CREATE INDEX IF NOT EXISTS taxonomy_segments_ord_idx ON taxonomy_segments(ord);

ALTER TABLE taxonomy_segments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "taxonomy_segments_authenticated_all" ON taxonomy_segments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE taxonomy_segments IS
  'Top-level B2B taxonomy. Modular, не hardcode HoReCa specifics. 11 rows after seed.';

-- ─────── 2. taxonomy_families ───────
CREATE TABLE IF NOT EXISTS taxonomy_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES taxonomy_segments(id) ON DELETE CASCADE,
  name_pl TEXT NOT NULL,
  name_en TEXT NOT NULL,
  ord INTEGER NOT NULL DEFAULT 0,
  required_attributes TEXT[] NOT NULL DEFAULT '{}',
  validation_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (segment_id, name_en)
);
CREATE INDEX IF NOT EXISTS taxonomy_families_segment_id_idx ON taxonomy_families(segment_id);
CREATE INDEX IF NOT EXISTS taxonomy_families_ord_idx ON taxonomy_families(segment_id, ord);

ALTER TABLE taxonomy_families ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "taxonomy_families_authenticated_all" ON taxonomy_families
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE taxonomy_families IS
  'Middle-layer taxonomy. Sweet spot для attribute defaults. required_attributes drives hygiene check; validation_rules drives value validation.';

-- ─────── 3. taxonomy_classes (4-th tier, schema-only) ───────
CREATE TABLE IF NOT EXISTS taxonomy_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES taxonomy_families(id) ON DELETE CASCADE,
  name_pl TEXT NOT NULL,
  name_en TEXT NOT NULL,
  ord INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, name_en)
);
CREATE INDEX IF NOT EXISTS taxonomy_classes_family_id_idx ON taxonomy_classes(family_id);

ALTER TABLE taxonomy_classes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "taxonomy_classes_authenticated_all" ON taxonomy_classes
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE taxonomy_classes IS
  'Optional 4-th tier. Schema-only цей sprint, не активно вживається.';

-- ─────── 4. family_attribute_defaults ───────
CREATE TABLE IF NOT EXISTS family_attribute_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES taxonomy_families(id) ON DELETE CASCADE,
  attr_key TEXT NOT NULL,
  default_value JSONB,
  attr_type TEXT NOT NULL CHECK (attr_type IN ('string', 'number', 'boolean', 'enum', 'array')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, attr_key)
);
CREATE INDEX IF NOT EXISTS family_attribute_defaults_family_id_idx ON family_attribute_defaults(family_id);

ALTER TABLE family_attribute_defaults ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "family_attribute_defaults_authenticated_all" ON family_attribute_defaults
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE family_attribute_defaults IS
  'Family-level default values. Resolution: SKU override (locked or unlocked) wins; else fall back to default. NULL у default_value = no default — must be filled per-SKU.';

-- ─────── 5. product_attributes (per-SKU values) ───────
CREATE TABLE IF NOT EXISTS product_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attr_key TEXT NOT NULL,
  value JSONB,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('family_default', 'off', 'gemini', 'manual', 'override')),
  override_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sku_id, attr_key)
);
CREATE INDEX IF NOT EXISTS product_attributes_sku_id_idx ON product_attributes(sku_id);
CREATE INDEX IF NOT EXISTS product_attributes_source_idx ON product_attributes(source);
CREATE INDEX IF NOT EXISTS product_attributes_attr_key_idx ON product_attributes(attr_key);

ALTER TABLE product_attributes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "product_attributes_authenticated_all" ON product_attributes
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION product_attributes_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_attributes_updated_at ON product_attributes;
CREATE TRIGGER product_attributes_updated_at
  BEFORE UPDATE ON product_attributes
  FOR EACH ROW EXECUTE FUNCTION product_attributes_set_updated_at();

COMMENT ON TABLE product_attributes IS
  'Per-SKU attribute values. Resolution rules in 023_taxonomy_core.sql header.';

-- ─────── 6. product_external (OFF + Gemini cache) ───────
CREATE TABLE IF NOT EXISTS product_external (
  sku_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  off_payload JSONB,
  off_fetched_at TIMESTAMPTZ,
  gemini_payload JSONB,
  gemini_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_external_off_fetched_at_idx
  ON product_external(off_fetched_at) WHERE off_fetched_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_external_off_payload_gin
  ON product_external USING gin(off_payload);

ALTER TABLE product_external ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "product_external_authenticated_all" ON product_external
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION product_external_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_external_updated_at ON product_external;
CREATE TRIGGER product_external_updated_at
  BEFORE UPDATE ON product_external
  FOR EACH ROW EXECUTE FUNCTION product_external_set_updated_at();

COMMENT ON TABLE product_external IS
  'External enrichment cache (OFF + Gemini raw). Re-fetch policy: off >= 7 days. 1:1 with products.';

-- ─────── 7. pkd_2007 ───────
CREATE TABLE IF NOT EXISTS pkd_2007 (
  code TEXT PRIMARY KEY,
  description TEXT,
  parent_code TEXT
);
CREATE INDEX IF NOT EXISTS pkd_2007_parent_code_idx ON pkd_2007(parent_code);

ALTER TABLE pkd_2007 ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "pkd_2007_authenticated_read" ON pkd_2007
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────── 8. pkd_2025 ───────
CREATE TABLE IF NOT EXISTS pkd_2025 (
  code TEXT PRIMARY KEY,
  description TEXT,
  parent_code TEXT
);
CREATE INDEX IF NOT EXISTS pkd_2025_parent_code_idx ON pkd_2025(parent_code);

ALTER TABLE pkd_2025 ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "pkd_2025_authenticated_read" ON pkd_2025
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────── 9. pkd_mapping ───────
CREATE TABLE IF NOT EXISTS pkd_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pkd_2007_code TEXT REFERENCES pkd_2007(code) ON DELETE CASCADE,
  pkd_2025_code TEXT REFERENCES pkd_2025(code) ON DELETE CASCADE,
  mapping_type TEXT NOT NULL CHECK (mapping_type IN ('exact', 'split', 'merge', 'unmapped')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pkd_mapping_2007_idx ON pkd_mapping(pkd_2007_code);
CREATE INDEX IF NOT EXISTS pkd_mapping_2025_idx ON pkd_mapping(pkd_2025_code);

ALTER TABLE pkd_mapping ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "pkd_mapping_authenticated_read" ON pkd_mapping
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE pkd_2007 IS 'PKD-2007 (Polska Klasyfikacja Działalności 2007). Source: GUS.';
COMMENT ON TABLE pkd_2025 IS 'PKD-2025 (revised classification). Replacement for PKD-2007.';
COMMENT ON TABLE pkd_mapping IS '2007↔2025 transition map. mapping_type: exact|split|merge|unmapped.';

-- ─────── 10. ALTER products ───────
ALTER TABLE products ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES taxonomy_families(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES taxonomy_classes(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hygiene_status TEXT
  CHECK (hygiene_status IS NULL OR hygiene_status IN ('CLEAN', 'DIRTY', 'UNCHECKED'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS hygiene_issues JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hygiene_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS products_family_id_idx ON products(family_id);
CREATE INDEX IF NOT EXISTS products_brand_idx ON products(brand);
CREATE INDEX IF NOT EXISTS products_hygiene_status_idx ON products(hygiene_status);

COMMENT ON COLUMN products.family_id IS
  'Soft link to taxonomy_families. NULL = not classified. category column kept for legacy.';
COMMENT ON COLUMN products.brand IS
  'Brand name. May = supplier.name для simple cases або differ для multi-brand suppliers.';
COMMENT ON COLUMN products.hygiene_status IS
  'CLEAN | DIRTY | UNCHECKED. Updated by nightly hygiene_scan_job (cron 03:00 Europe/Warsaw).';
COMMENT ON COLUMN products.hygiene_issues IS
  'JSONB list з last hygiene scan: [{"key": "volume_ml", "issue": "missing_required"}, ...].';

-- ─────── 11. ALTER clients (PKD dual-arrays) ───────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pkd_2007_codes TEXT[];
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pkd_2025_codes TEXT[];

CREATE INDEX IF NOT EXISTS clients_pkd_2007_codes_gin ON clients USING gin(pkd_2007_codes);
CREATE INDEX IF NOT EXISTS clients_pkd_2025_codes_gin ON clients USING gin(pkd_2025_codes);

COMMENT ON COLUMN clients.pkd_2007_codes IS 'PKD-2007 codes (legacy). Used for L5 matching (Sprint F).';
COMMENT ON COLUMN clients.pkd_2025_codes IS 'PKD-2025 codes (current). From GUS enrichment when available.';
