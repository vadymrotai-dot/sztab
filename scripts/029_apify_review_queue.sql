-- 029_apify_review_queue.sql
-- Sprint I / Commit 1: pre-Apify quality gate.
--
-- Note: spec called це "Migration 028" але 028 уже used by Sprint H
-- contact_enrichment. Renumber до 029.
--
-- ARCHITECTURAL DEVIATION з spec:
-- Spec asked GENERATED ALWAYS AS STORED `apify_eligible` column referencing
-- clients/ceidg_prospects (cross-table eligibility via PKD/VAT/registered_date).
-- Postgres GENERATED columns CANNOT reference other tables — only same-row
-- expressions. Solution: skip the generated col, compute eligibility inline
-- at query time у /api/matches/apify-queue (SQL з JOIN to clients/prospects).
-- Filter is well-defined тому centralizing у one query is cleaner than
-- denormalizing eligibility data onto matches.
--
-- Adds: apify_review_status / apify_reviewed_at / apify_reviewed_by для
-- per-match Vadym approval state. Index щоб TOP-N query швидкий.
--
-- Idempotent.

ALTER TABLE matches ADD COLUMN IF NOT EXISTS apify_review_status TEXT
  DEFAULT 'pending'
  CHECK (apify_review_status IS NULL OR apify_review_status IN ('pending', 'approved', 'skipped'));
ALTER TABLE matches ADD COLUMN IF NOT EXISTS apify_reviewed_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS apify_reviewed_by TEXT;

-- Index для apify-queue lookup (sort by combined_score within review status)
CREATE INDEX IF NOT EXISTS idx_matches_apify_review
  ON matches(apify_review_status, combined_score DESC)
  WHERE combined_score >= 70;

COMMENT ON COLUMN matches.apify_review_status IS
  'Pre-Apify gate state: pending (default), approved (Vadym reviewed → eligible
   для /api/admin/enrich/apify-batch), skipped (review-rejected, не buduть Apify).';
COMMENT ON COLUMN matches.apify_reviewed_by IS
  'Email/identifier reviewer (used dla audit trail).';
