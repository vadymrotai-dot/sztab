-- 012_phase2_deep_discovery.sql
-- Sprint v2.1 / Phase 2 Step 0: deep discovery infrastructure.
-- Idempotent.

-- 1. Extend params row z Apify + KRS Rejestr.io tokens. Re-uses
-- per-user params row pattern (RLS-owner-scoped przez params policy
-- ustawioną w 001). Fallback na Vercel ENV nadal działa w server
-- actions, ale UI w /settings → tab "Klucze API" zarządza per-user.
ALTER TABLE params ADD COLUMN IF NOT EXISTS apify_api_token TEXT;
ALTER TABLE params ADD COLUMN IF NOT EXISTS krs_rejestr_api_token TEXT;
COMMENT ON COLUMN params.apify_api_token IS 'Apify API token dla web scraping (Aleo, Panorama Firm). User-managed przez /settings.';
COMMENT ON COLUMN params.krs_rejestr_api_token IS 'KRS Rejestr.io API token dla weryfikacji polskich firm (NIP, KRS lookup). User-managed.';

-- 2. discovered_entities: child table dla firm znalezionych w
-- konkretnym deep_discovery runie. Każdy run produkuje N rows.
-- ON DELETE CASCADE z runa — usunięcie runa kasuje encje.
-- ON DELETE SET NULL z clients (imported_to_clients_id) — usunięcie
-- klienta nie usuwa historii odkrycia, tylko zerwana referencja.
CREATE TABLE IF NOT EXISTS discovered_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES intelligence_runs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,
  nip TEXT,
  krs TEXT,
  regon TEXT,

  -- Contact
  website TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,

  -- Classification
  segment_name TEXT,
  branza TEXT,
  channel_type TEXT,

  -- Quality
  source TEXT NOT NULL CHECK (source IN ('aleo', 'panorama_firm', 'gemini_search', 'krs_rejestr', 'manual')),
  source_confidence NUMERIC(3,2) CHECK (source_confidence BETWEEN 0 AND 1),
  fit_score INT CHECK (fit_score BETWEEN 0 AND 100),
  nip_verified BOOLEAN DEFAULT false,
  krs_verified BOOLEAN DEFAULT false,

  -- Outreach (AI-generated)
  outreach_approach TEXT,
  outreach_pitch TEXT,

  -- Status pipeline: new → reviewed (Vadym przejrzał) → exported
  -- (skopiowany do clients) lub rejected
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'exported', 'rejected')),
  imported_to_clients_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Raw scraper payload — debug + future re-processing
  raw_data JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discovered_entities_run_idx ON discovered_entities(run_id);
CREATE INDEX IF NOT EXISTS discovered_entities_owner_idx ON discovered_entities(owner_id);
CREATE INDEX IF NOT EXISTS discovered_entities_nip_idx ON discovered_entities(nip);
CREATE INDEX IF NOT EXISTS discovered_entities_status_idx ON discovered_entities(status);
-- Per-owner unique NIP — zapobiega duplikatom między różnymi runami
-- tego samego owner-a. Partial index (WHERE nip IS NOT NULL) pozwala
-- mieć encje bez NIP (np. tylko nazwa z scraperów).
CREATE UNIQUE INDEX IF NOT EXISTS discovered_entities_nip_owner_uniq
  ON discovered_entities(nip, owner_id) WHERE nip IS NOT NULL;

ALTER TABLE discovered_entities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "discovered_entities_owner_access" ON discovered_entities
    FOR ALL TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. intelligence_runs.run_type CHECK — re-stwierdzenie z 011, no-op
-- jeśli już ma poprawny set wartości. Defensive: drop-and-recreate
-- żeby pewnie obejmowało 'deep_discovery' (Phase 2).
ALTER TABLE intelligence_runs DROP CONSTRAINT IF EXISTS intelligence_runs_run_type_check;
ALTER TABLE intelligence_runs ADD CONSTRAINT intelligence_runs_run_type_check
  CHECK (run_type IN ('fast_lookup', 'deep_discovery', 'partner_analysis'));
