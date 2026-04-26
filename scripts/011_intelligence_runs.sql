-- 011_intelligence_runs.sql
-- AI analysis history for Sprint v2.0 / Phase 1: Fast Lookup на /products.
-- Każdy run (fast_lookup, deep_discovery, partner_analysis) zapisuje
-- target_snapshot (frozen state of the analyzed entity), prompt, raw
-- Gemini response i parsed_results. Dashboard /intelligence czyta to
-- chronologicznie. RLS owner-only — analiza zawiera komercyjnie wrażliwe
-- dane konkurencji i strategii cenowej.

CREATE TABLE IF NOT EXISTS intelligence_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL CHECK (run_type IN ('fast_lookup', 'deep_discovery', 'partner_analysis')),
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'category', 'supplier', 'client')),
  target_id UUID NOT NULL,
  target_snapshot JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  prompt_text TEXT,
  raw_response JSONB,
  parsed_results JSONB,
  results_count INT DEFAULT 0,
  duration_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS intelligence_runs_owner_idx ON intelligence_runs(owner_id);
CREATE INDEX IF NOT EXISTS intelligence_runs_target_idx ON intelligence_runs(target_type, target_id);
CREATE INDEX IF NOT EXISTS intelligence_runs_created_idx ON intelligence_runs(created_at DESC);

ALTER TABLE intelligence_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "intelligence_runs_owner_access" ON intelligence_runs
    FOR ALL TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
