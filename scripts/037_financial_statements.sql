-- 037_financial_statements.sql
-- Sprint S1 Phase 1 — XBRL JSON parsed financial data per fiscal year.
-- Multiple rows per client (one per okres_data_koniec). Idempotent.

CREATE TABLE IF NOT EXISTS financial_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  krs_doc_id BIGINT,
  okres_data_start DATE,
  okres_data_koniec DATE NOT NULL,
  przychody_netto NUMERIC,
  zysk_netto NUMERIC,
  aktywa_razem NUMERIC,
  liczba_pracownikow INTEGER,
  raw_xbrl_json JSONB,
  source TEXT NOT NULL DEFAULT 'rejestrio_v2',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, okres_data_koniec)
);

CREATE INDEX IF NOT EXISTS idx_financial_statements_client_year
  ON financial_statements(client_id, okres_data_koniec DESC);

ALTER TABLE financial_statements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "fs_authenticated_all" ON financial_statements
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
