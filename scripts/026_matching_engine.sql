-- 026_matching_engine.sql
-- Sprint F / Commit 1: L5 Matching Engine schema.
--
-- Note: spec called це "Migration 025" але 025 уже used by extend_source_enum.
-- Renumber to 026.
--
-- Hybrid table: matches може бути client-side (B2B existing) АБО prospect-side
-- (CEIDG discovery pool). XOR via NULL exclusivity на client_id/prospect_id +
-- partial UNIQUE indexes per branch.
--
-- Cascade FKs ensure deletions clean orphan matches.
-- expires_at = computed_at + 7 days — driven by /api/cron/matching-refresh.
--
-- Idempotent.

-- ─────── matches table ───────
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NULL REFERENCES clients(id) ON DELETE CASCADE,
  prospect_id UUID NULL REFERENCES ceidg_prospects(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  algo_score INTEGER NOT NULL CHECK (algo_score >= 0 AND algo_score <= 100),
  subscore_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  loyalty_multiplier NUMERIC(2,1) NOT NULL DEFAULT 1.0
    CHECK (loyalty_multiplier IN (0, 0.5, 1.0)),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  -- XOR: exactly one of client_id/prospect_id MUST be set
  CONSTRAINT matches_target_xor CHECK (
    (client_id IS NULL) <> (prospect_id IS NULL)
  )
);

-- Partial UNIQUE: per-branch dedup
CREATE UNIQUE INDEX IF NOT EXISTS matches_client_product_uniq
  ON matches(client_id, product_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS matches_prospect_product_uniq
  ON matches(prospect_id, product_id) WHERE prospect_id IS NOT NULL;

-- Score-ordered indexes per spec
CREATE INDEX IF NOT EXISTS idx_matches_client_score
  ON matches(client_id, algo_score DESC) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_prospect_score
  ON matches(prospect_id, algo_score DESC) WHERE prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_product_score
  ON matches(product_id, algo_score DESC);
CREATE INDEX IF NOT EXISTS idx_matches_score_global
  ON matches(algo_score DESC) WHERE algo_score >= 50;
CREATE INDEX IF NOT EXISTS idx_matches_expires
  ON matches(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "matches_authenticated_all" ON matches
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE matches IS
  'L5 algo matching engine output. XOR target: client_id OR prospect_id (not both).
   algo_score 0-100 = Σ(subscores) × loyalty_multiplier, clamped.
   subscore_breakdown JSONB: {pkd, activity, size, geo, recency, hygiene}.
   expires_at + 7 days, refreshed by /api/cron/matching-refresh.';

-- ─────── GIN indexes on PKD arrays (clients) ───────
CREATE INDEX IF NOT EXISTS idx_clients_pkd_2025
  ON clients USING GIN(pkd_2025_codes);
CREATE INDEX IF NOT EXISTS idx_clients_pkd_2007
  ON clients USING GIN(pkd_2007_codes);

-- ─────── ALTER taxonomy_families: target PKD lists ───────
ALTER TABLE taxonomy_families
  ADD COLUMN IF NOT EXISTS target_pkd_2025 TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_pkd_2007 TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN taxonomy_families.target_pkd_2025 IS
  'Target PKD-2025 codes для PKD-fit subscore. Dotted format (e.g. "47.25.Z").';
COMMENT ON COLUMN taxonomy_families.target_pkd_2007 IS
  'Derived target_pkd_2025 ↔ pkd_mapping. Cached at seed time, refresh коли target_pkd_2025 змінено.';

-- ─────── ALTER products: price_tier ───────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS price_tier TEXT
  CHECK (price_tier IS NULL OR price_tier IN ('budget', 'mid', 'premium'));

COMMENT ON COLUMN products.price_tier IS
  'Price tier для size-match subscore. NULL для now (Sprint F не auto-derives — no pricing data на 35 SKU). Залишаємо schema, size_match використовує fallback "unknown".';
