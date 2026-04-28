-- 030_primary_match_flag.sql
-- Sprint J / Commit 1: Issue 1 — matching explosion fix.
--
-- PROBLEM: same NIP × N products = N match rows. LUCKY PING ZHAO
-- мав 30+ rows у TOP-50 review queue (one prospect, multiple SKUs з same
-- Family). Apify spend на duplicates = wasteful.
--
-- FIX: ADD is_primary_for_target — TRUE для highest-scoring match per
-- target (client_id OR prospect_id). Backfill via window function. Hook
-- into engine bulk + per-target operations.
--
-- Note: spec called це "Migration 029" але 029 уже used (Sprint I).
-- Renumber до 030.
--
-- Idempotent.

ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_primary_for_target BOOLEAN
  NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN matches.is_primary_for_target IS
  'TRUE для highest-scoring match per (client_id OR prospect_id). Used by
   apify-queue Layer 1 filter — ensures kожen унікальна firma з''являється
   тільки 1× у TOP-N. Backfilled by refresh_primary_match_flags() RPC
   після bulk recompute.';

-- Partial index — fast filter дla apify-queue:
CREATE INDEX IF NOT EXISTS idx_matches_primary_score
  ON matches(combined_score DESC)
  WHERE is_primary_for_target = TRUE AND combined_score >= 70;

-- ─────── refresh_primary_match_flags() RPC ───────
-- Computes ranking partition by COALESCE(client_id, prospect_id),
-- ordered by combined_score DESC, computed_at DESC. Only rank=1 → TRUE.
--
-- Scope params:
--   p_target_type IS NULL                  → recompute all
--   p_target_type = 'client',  id provided → only rows для one client
--   p_target_type = 'prospect', id provided → only rows для one prospect
--
-- SECURITY DEFINER щоб callable з authenticated context (matches RLS allows
-- read+write для authenticated, але ROW_NUMBER() OVER не blocked anyway —
-- DEFINER tylko для consistency).

CREATE OR REPLACE FUNCTION refresh_primary_match_flags(
  p_target_type TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(client_id, prospect_id)
             ORDER BY combined_score DESC, computed_at DESC
           ) AS rn
    FROM matches
    WHERE
      p_target_type IS NULL
      OR (p_target_type = 'client' AND client_id = p_target_id)
      OR (p_target_type = 'prospect' AND prospect_id = p_target_id)
  )
  UPDATE matches m
  SET is_primary_for_target = (r.rn = 1)
  FROM ranked r
  WHERE m.id = r.id
    AND m.is_primary_for_target IS DISTINCT FROM (r.rn = 1);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION refresh_primary_match_flags IS
  'Re-computes is_primary_for_target across matches. Called from
   bulkRecomputeAll (no scope = all) і per-target compute (scoped).
   Returns count of rows where flag changed.';

GRANT EXECUTE ON FUNCTION refresh_primary_match_flags TO authenticated;

-- ─────── Initial backfill — populate flag для всіх existing rows ───────
SELECT refresh_primary_match_flags();
