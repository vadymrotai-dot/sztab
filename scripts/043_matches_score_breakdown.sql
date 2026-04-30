-- 043_matches_score_breakdown.sql
-- Sprint S2A Phase 3 — rich score_breakdown JSONB column on matches.
--
-- Existing subscore_breakdown JSONB stays (number-keyed: pkd, activity,
-- size, geo, recency, niche_bonus). New score_breakdown captures
-- S2A formula structure: {base, penalties, bonuses, reasons[]}.
-- Idempotent.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;
