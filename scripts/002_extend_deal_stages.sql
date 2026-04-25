-- Sprint 1 / Pre-task 0: extend deals.stage to 7 PL stages
-- Adds 'sample' and 'kontrakt' to allowed stage values.
-- Idempotent: safe to run multiple times. Defensive: handles both
-- "no constraint exists" (original 001 schema) and "constraint exists"
-- (added by the v2 migration) cases.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deals_stage_check'
      AND conrelid = 'deals'::regclass
  ) THEN
    ALTER TABLE deals DROP CONSTRAINT deals_stage_check;
  END IF;

  ALTER TABLE deals
    ADD CONSTRAINT deals_stage_check
    CHECK (stage IN (
      'lead',
      'oferta',
      'negocjacje',
      'sample',
      'kontrakt',
      'wygrana',
      'przegrana'
    ));
END $$;

-- Speed up the Dzis "Zadzwoń dziś" query (next_action_date <= today, open deals).
CREATE INDEX IF NOT EXISTS idx_deals_next_action_date
  ON deals (next_action_date)
  WHERE next_action_date IS NOT NULL;

-- Speed up the "Wymagają uwagi" query (open deals by updated_at).
CREATE INDEX IF NOT EXISTS idx_deals_updated_at
  ON deals (updated_at);
