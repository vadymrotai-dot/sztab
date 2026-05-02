-- Sprint S-INTEL.1.2.1 — commodity_to_cn_map bridge table.
-- Manually curated mapping між source category strings та CN codes.
-- Phase 1 (S-INTEL.1.2.1): top 10 cross-supplier seed (Vadym + Claude).
-- Phase 2 (S-INTEL.2+): AI auto-mapping коли accumulated more diverse labels.
--
-- Resolution rules:
--  - Exact match (source, source_label) — primary lookup
--  - Substring match — fallback (TODO у lib/intelligence/cn-resolver.ts)
--  - AI suggester — last resort якщо no curated entry (S-INTEL.2+)

CREATE TABLE IF NOT EXISTS commodity_to_cn_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (
    source IN ('zsrir', 'fresh_market_pl', 'eu_agri')
  ),
  source_label TEXT NOT NULL,
  cn_code TEXT NOT NULL CHECK (cn_code ~ '^[0-9]{8}$'),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_label)
);

CREATE INDEX IF NOT EXISTS commodity_to_cn_map_source_idx
  ON commodity_to_cn_map(source, source_label);
CREATE INDEX IF NOT EXISTS commodity_to_cn_map_cn_code_idx
  ON commodity_to_cn_map(cn_code);

ALTER TABLE commodity_to_cn_map ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "commodity_to_cn_map_authenticated_read" ON commodity_to_cn_map
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "commodity_to_cn_map_service_write" ON commodity_to_cn_map
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE commodity_to_cn_map IS
  'Manually curated bridge між source category labels та CN codes. Phase 1 = 10 cross-supplier ZSRIR seeds. Expand incremental з реальних labels у 1.2.2/1.2.3.';
COMMENT ON COLUMN commodity_to_cn_map.source_label IS
  'Exact match string з source. Case-sensitive. Якщо source повертає different formatting (uppercase, trailing spaces) — нормалізувати у resolver.';
COMMENT ON COLUMN commodity_to_cn_map.cn_code IS
  '8-digit EU Combined Nomenclature без spaces (regex ^[0-9]{8}$). Bridges raw commodity до products.cn_code.';
