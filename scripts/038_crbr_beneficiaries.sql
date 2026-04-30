-- 038_crbr_beneficiaries.sql
-- Sprint S1 Phase 1 — CRBR (Centralny Rejestr Beneficjentów Rzeczywistych)
-- ultimate beneficial owners. Idempotent.

CREATE TABLE IF NOT EXISTS crbr_beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  rejestrio_person_id BIGINT,
  imie TEXT,
  nazwisko TEXT,
  kraj_rezydencji TEXT,
  obywatelstwa TEXT[] NOT NULL DEFAULT '{}',
  rola TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, rejestrio_person_id)
);

CREATE INDEX IF NOT EXISTS idx_crbr_client
  ON crbr_beneficiaries(client_id);

ALTER TABLE crbr_beneficiaries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "crbr_authenticated_all" ON crbr_beneficiaries
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
