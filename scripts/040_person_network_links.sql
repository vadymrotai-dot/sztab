-- 040_person_network_links.sql
-- Sprint S1 Phase 1 — cross-org person links via /osoby/{id}/krs-powiazania.
-- Tracks person's other companies (board roles, shareholdings, beneficiary).
-- Idempotent.

CREATE TABLE IF NOT EXISTS person_network_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  linked_krs TEXT,
  linked_company_name TEXT,
  relation_type TEXT,
  relation_kierunek TEXT CHECK (relation_kierunek IN ('AKTYWNY', 'PASYWNY')),
  data_start DATE,
  data_koniec DATE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pnl_person
  ON person_network_links(source_person_id);
CREATE INDEX IF NOT EXISTS idx_pnl_krs
  ON person_network_links(linked_krs)
  WHERE linked_krs IS NOT NULL;

ALTER TABLE person_network_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "pnl_authenticated_all" ON person_network_links
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
