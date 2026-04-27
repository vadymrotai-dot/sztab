-- 015_ceidg_scoring.sql
-- Phase 2.6 Step 3: scoring engine v1 — 4-channel HoReCa.
--
-- Migration components:
-- 1. Extend ceidg_sync_runs.status enum: add 'paused' (user-controlled
--    stop via --max-pages — see overnight-watchdog TODO w Promt 4).
-- 2. CREATE TABLE ceidg_prospect_scores — per-version per-prospect
--    score row. UNIQUE(prospect_id, scoring_version) → A/B testing
--    (V1 + V2 dual-write) bez ruszania zapisanych rzędów V1.
-- 3. CREATE VIEW scored_prospects — convenience join + has_contact
--    computed. security_invoker=true → RLS z base tables apply
--    (Postgres 15+, Supabase domyślnie definer-mode dla VIEW —
--    musimy explicit invoker żeby nie obejść owner-scope bezpieczeństwa).
-- 4. RLS na ceidg_prospect_scores: shared dla authenticated (jak
--    ceidg_prospects — broker-only, no per-user scope).
--
-- Idempotent.

-- 1. Extend sync_runs status enum
ALTER TABLE ceidg_sync_runs DROP CONSTRAINT IF EXISTS ceidg_sync_runs_status_check;
ALTER TABLE ceidg_sync_runs ADD CONSTRAINT ceidg_sync_runs_status_check
  CHECK (status IN ('running', 'paused', 'completed', 'failed', 'rate_limited'));
COMMENT ON COLUMN ceidg_sync_runs.status IS
  'Sync run state: running (active OR pre-watchdog crashed), paused (user --max-pages stop), completed (reached last page), failed (uncaught error), rate_limited (CEIDG 429 exhausted retries).';

-- 2. Scores table
CREATE TABLE IF NOT EXISTS ceidg_prospect_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES ceidg_prospects(id) ON DELETE CASCADE,

  -- Per-channel scores (0.00 - 100.00)
  sklep_score NUMERIC(5,2),
  restaurant_score NUMERIC(5,2),
  catering_score NUMERIC(5,2),
  cafe_score NUMERIC(5,2),
  horeca_meta_score NUMERIC(5,2),

  -- 'sklep' | 'restaurant' | 'catering' | 'cafe' | 'multi'
  -- (no CHECK — TEXT dla elastyczności; runner gwarantuje listę)
  dominant_channel TEXT,

  -- Chain franchise detection (Żabka, Carrefour, etc.) z uprawnienia.opis
  is_chain_franchise BOOLEAN DEFAULT FALSE,
  chain_brand TEXT,

  -- Layer 1 (filters): false → all *_score = 0, breakdown {filter:{...}}
  filter_passed BOOLEAN DEFAULT TRUE,
  filter_exclusion_reason TEXT,

  -- {sklep:{pkd,brand,owner,contact,breadth,recency,total}, restaurant:{...},
  --  catering:{...}, cafe:{...}, meta:{...}, filter:{...}, chain:{...}}
  score_breakdown JSONB,

  scored_at TIMESTAMPTZ DEFAULT now(),
  scoring_version TEXT DEFAULT 'v1',

  UNIQUE (prospect_id, scoring_version)
);

CREATE INDEX IF NOT EXISTS ceidg_scores_prospect_idx
  ON ceidg_prospect_scores(prospect_id);
CREATE INDEX IF NOT EXISTS ceidg_scores_meta_desc_idx
  ON ceidg_prospect_scores(horeca_meta_score DESC);
CREATE INDEX IF NOT EXISTS ceidg_scores_dominant_channel_idx
  ON ceidg_prospect_scores(dominant_channel);
CREATE INDEX IF NOT EXISTS ceidg_scores_filter_passed_idx
  ON ceidg_prospect_scores(filter_passed) WHERE filter_passed = TRUE;
CREATE INDEX IF NOT EXISTS ceidg_scores_breakdown_gin
  ON ceidg_prospect_scores USING gin(score_breakdown);

-- 3. RLS — shared access dla authenticated (jak ceidg_prospects)
ALTER TABLE ceidg_prospect_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ceidg_scores_authenticated_all" ON ceidg_prospect_scores
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE ceidg_prospect_scores IS
  'Per-prospect scoring results (4-channel HoReCa: sklep/restaurant/catering/cafe + meta). Per scoring_version dla A/B re-tuning. Filtered prospects mają wszystkie *_score=0 + filter_passed=false + filter_exclusion_reason.';

-- 4. View: prospects + scores + has_contact
-- security_invoker=true (PG15+) → RLS z ceidg_prospects i ceidg_prospect_scores
-- są stosowane wobec invoker-a, nie definer-a. Bez tego VIEW omija RLS.
DROP VIEW IF EXISTS scored_prospects;
CREATE VIEW scored_prospects
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.ceidg_id,
  p.nip,
  p.regon,
  p.name,
  p.owner_name,
  p.status,
  p.pkd_main,
  p.pkd_all,
  p.wojewodztwo,
  p.powiat,
  p.gmina,
  p.miejscowosc,
  p.kod_pocztowy,
  p.ulica,
  p.budynek,
  p.lokal,
  p.adres_full,
  p.lat,
  p.lng,
  p.data_rozpoczecia,
  p.email,
  p.telefon,
  p.www,
  p.source,
  p.raw_data,
  p.created_at,
  p.updated_at,
  p.last_synced_at,
  s.sklep_score,
  s.restaurant_score,
  s.catering_score,
  s.cafe_score,
  s.horeca_meta_score,
  s.dominant_channel,
  s.is_chain_franchise,
  s.chain_brand,
  s.filter_passed,
  s.filter_exclusion_reason,
  s.score_breakdown,
  s.scored_at,
  s.scoring_version,
  (p.email IS NOT NULL OR p.telefon IS NOT NULL) AS has_contact
FROM ceidg_prospects p
LEFT JOIN ceidg_prospect_scores s ON s.prospect_id = p.id;

COMMENT ON VIEW scored_prospects IS
  'Convenience JOIN ceidg_prospects + ceidg_prospect_scores z computed has_contact. security_invoker=true → RLS z base tables aplikowane.';
