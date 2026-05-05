-- 058_product_match_runs.sql
-- Sprint S-CORE.3.B (B piece) — manual mark-contacted log для iterative
-- exclusion на /produkty TOP 25 dopasowań.
--
-- Pattern: User натискає "Zkontaktowano" біля клієнта у matches list,
-- INSERT INTO product_match_runs. Наступний "Pokaż następnych 25"
-- excludes already-contacted (LEFT JOIN ... WHERE pmr.id IS NULL).
--
-- Per-product-per-match-per-user idempotent (UNIQUE constraint).
-- Cascade on products + matches deletion (cleanup orphans automatically).
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS product_match_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  contacted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contacted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (product_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_product_match_runs_product
  ON product_match_runs(product_id, contacted_at DESC);

ALTER TABLE product_match_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "product_match_runs_authenticated_all" ON product_match_runs
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE product_match_runs IS
  'Manual mark-contacted log per product × match. Used by /produkty TOP 25 section to exclude already-contacted клієнтів у iterative "Pokaż następnych 25" flow. Per Sprint S-CORE.3.B (04.05.2026).';

COMMENT ON COLUMN product_match_runs.contacted_by IS
  'auth.users.id хто натиснув Zkontaktowano. ON DELETE SET NULL preserves history якщо user removed.';
