-- 014_ceidg_prospects.sql
-- Phase 2.6 / Step 1: CEIDG foundation. Per-user CEIDG API key w params,
-- shared prospect pool (CEIDG to publiczny rejestr — wszystkie firmy
-- dostępne globalnie, brak owner_id) + sync runs telemetria.
--
-- Source: dane.biznes.gov.pl/api/ceidg/v3 — JSON shape zweryfikowany
-- probe-em (lista + detail) 2026-04-27. Pola które CEIDG NIE zwraca w
-- probe (email/telefon/www, lat/lng) zostają NULLable — wypełniane
-- później przez enrichment step (Apify scrape, geocoding).
--
-- pkd_main / pkd_all — compact format (np. '5610A', bez kropek), bo
-- CEIDG właśnie tak zwraca i tak filtruje (?pkd=5610A).
--
-- Idempotent.

-- 1. params: per-user CEIDG token. Pattern jak gemini_key,
-- apify_api_token, krs_rejestr_api_token. RLS owner-scoped przez
-- istniejącą polisę z 001.
ALTER TABLE params ADD COLUMN IF NOT EXISTS ceidg_api_key TEXT;
COMMENT ON COLUMN params.ceidg_api_key IS
  'CEIDG API JWT token (dane.biznes.gov.pl/api/ceidg/v3). User-managed przez /settings → Klucze API. Format: JWT z claim client_id.';

-- 2. ceidg_prospects: shared pool firm pobranych z CEIDG. Brak owner_id
-- bo CEIDG to dane publiczne — system broker-only, jeden zespół, jedna
-- baza prospects do wspólnej obróbki.
CREATE TABLE IF NOT EXISTS ceidg_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ceidg_id TEXT UNIQUE NOT NULL,        -- firma.id z CEIDG (UUID string)

  -- Identity
  nip TEXT,
  regon TEXT,
  name TEXT NOT NULL,                   -- firma.nazwa
  owner_name TEXT,                      -- "${imie} ${nazwisko}" z wlasciciel

  -- Status z CEIDG: AKTYWNY / WYKRESLONY / ZAWIESZONY /
  -- WYLACZNIE_W_FORMIE_SPOLKI. Bez CHECK constraint — CEIDG może
  -- dorzucić nowe wartości, nie chcemy łamać sync na unknown status.
  status TEXT NOT NULL,

  -- PKD: compact format (5610A bez kropek). pkd_main = pkdGlowny.kod,
  -- pkd_all = wszystkie kody z firma.pkd[].kod (włącznie z pkd_main).
  pkd_main TEXT,
  pkd_all TEXT[],

  -- Address (z adresDzialalnosci)
  wojewodztwo TEXT,                     -- UPPERCASE jak CEIDG zwraca
  powiat TEXT,
  gmina TEXT,
  miejscowosc TEXT,                     -- adres.miasto
  kod_pocztowy TEXT,                    -- adres.kod
  ulica TEXT,
  budynek TEXT,
  lokal TEXT,
  adres_full TEXT,                      -- denormalized one-liner dla UI

  -- Geo — CEIDG nie zwraca, future enrichment via geocoding
  lat NUMERIC,
  lng NUMERIC,

  data_rozpoczecia DATE,

  -- Contact — CEIDG nie zwraca w v3 probe; future enrichment
  email TEXT,
  telefon TEXT,
  www TEXT,

  source TEXT DEFAULT 'ceidg',
  raw_data JSONB,                       -- pełny payload firma[0] z detail endpoint

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ DEFAULT now()
);

-- Indices
CREATE UNIQUE INDEX IF NOT EXISTS ceidg_prospects_ceidg_id_uniq
  ON ceidg_prospects(ceidg_id);
CREATE INDEX IF NOT EXISTS ceidg_prospects_woj_status_idx
  ON ceidg_prospects(wojewodztwo, status);
CREATE INDEX IF NOT EXISTS ceidg_prospects_pkd_main_idx
  ON ceidg_prospects(pkd_main);
CREATE INDEX IF NOT EXISTS ceidg_prospects_nip_idx
  ON ceidg_prospects(nip);
CREATE INDEX IF NOT EXISTS ceidg_prospects_pkd_all_gin
  ON ceidg_prospects USING gin(pkd_all);
CREATE INDEX IF NOT EXISTS ceidg_prospects_raw_data_gin
  ON ceidg_prospects USING gin(raw_data);

-- updated_at trigger (pattern jak inne tabele w 001/012)
CREATE OR REPLACE FUNCTION ceidg_prospects_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ceidg_prospects_updated_at ON ceidg_prospects;
CREATE TRIGGER ceidg_prospects_updated_at
  BEFORE UPDATE ON ceidg_prospects
  FOR EACH ROW
  EXECUTE FUNCTION ceidg_prospects_set_updated_at();

-- RLS: shared read/write dla authenticated. CEIDG to dane publiczne,
-- broker-only system, brak owner_id na poziomie row.
ALTER TABLE ceidg_prospects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ceidg_prospects_authenticated_all" ON ceidg_prospects
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE ceidg_prospects IS
  'CEIDG firm pool (Centralna Ewidencja i Informacja o Działalności Gospodarczej). Shared dla całego zespołu broker — brak owner_id. Sync via CeidgClient (lib/ceidg/client.ts).';

-- 3. ceidg_sync_runs: telemetria runów paginatora. Każdy run = jeden
-- filter set (np. pkd=5610A + woj=mazowieckie). Pomaga debugować
-- rate limity, wznawiać przerwane sync, mierzyć koszt API.
CREATE TABLE IF NOT EXISTS ceidg_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'rate_limited')),
  filters JSONB NOT NULL,               -- {pkd, wojewodztwo, status, ...}
  total_pages INTEGER,                  -- z links.last na pierwszej page
  processed_pages INTEGER DEFAULT 0,
  inserted_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_message TEXT,
  api_calls_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ceidg_sync_runs_started_at_idx
  ON ceidg_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS ceidg_sync_runs_status_idx
  ON ceidg_sync_runs(status);

ALTER TABLE ceidg_sync_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ceidg_sync_runs_authenticated_all" ON ceidg_sync_runs
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE ceidg_sync_runs IS
  'Telemetria CEIDG sync. Jeden run per filter set, śledzi paginację + rate limity.';
