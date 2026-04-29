-- 034_cohort_handoff.sql
-- Sprint N Phase B5 + C1 — cohort handoff infrastructure.
--
-- Two tables:
--   • cohort_cold_openers — per-entity AI-generated cold email opening line.
--     Multiple revisions allowed (regenerate з different prompt).
--   • pikniko_handoff_cohorts — named cohort з ranked entity list. Single
--     row per cohort_name; entity_ids array preserves ranking order.
--
-- Idempotent.

-- ─── 1. cohort_cold_openers ───
CREATE TABLE IF NOT EXISTS cohort_cold_openers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES ceidg_prospects(id) ON DELETE CASCADE,
  CONSTRAINT cold_opener_target_xor CHECK (
    (client_id IS NULL) <> (prospect_id IS NULL)
  ),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  family_id UUID REFERENCES taxonomy_families(id) ON DELETE SET NULL,
  opener_text TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pl' CHECK (language IN ('pl', 'ua', 'en')),
  model_used TEXT,
  cost_usd NUMERIC(10, 6),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index за target дla quick lookup
CREATE INDEX IF NOT EXISTS idx_cold_opener_client
  ON cohort_cold_openers(client_id, generated_at DESC) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cold_opener_prospect
  ON cohort_cold_openers(prospect_id, generated_at DESC) WHERE prospect_id IS NOT NULL;

ALTER TABLE cohort_cold_openers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "cold_opener_authenticated_all" ON cohort_cold_openers
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. pikniko_handoff_cohorts ───
CREATE TABLE IF NOT EXISTS pikniko_handoff_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_name TEXT NOT NULL UNIQUE,
  entity_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_entities INT GENERATED ALWAYS AS (jsonb_array_length(entity_ids)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pikniko_cohort_created
  ON pikniko_handoff_cohorts(created_at DESC);

ALTER TABLE pikniko_handoff_cohorts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "pikniko_cohort_authenticated_all" ON pikniko_handoff_cohorts
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_pikniko_cohort_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pikniko_cohort_touch ON pikniko_handoff_cohorts;
CREATE TRIGGER pikniko_cohort_touch
  BEFORE UPDATE ON pikniko_handoff_cohorts
  FOR EACH ROW EXECUTE FUNCTION touch_pikniko_cohort_updated_at();
