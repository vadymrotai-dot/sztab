-- 041_company_branches.sql
-- Sprint S1 Phase 1 — jednostki lokalne з GUS BIR ListaJednLokalnych.
-- Multiple rows per client. Idempotent.

CREATE TABLE IF NOT EXISTS company_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  regon_jednostki TEXT,
  nazwa TEXT,
  adres JSONB,
  data_rozpoczecia DATE,
  status TEXT NOT NULL DEFAULT 'AKTYWNA',
  source TEXT NOT NULL DEFAULT 'gus_bir',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, regon_jednostki)
);

CREATE INDEX IF NOT EXISTS idx_company_branches_client
  ON company_branches(client_id);

ALTER TABLE company_branches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "branches_authenticated_all" ON company_branches
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
