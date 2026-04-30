-- 036_clients_rejestrio_fields.sql
-- Sprint S1 Phase 1 — extend clients table з rejestr.io v2 + GUS BIR fields.
-- Idempotent.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS email_krs TEXT,
  ADD COLUMN IF NOT EXISTS website_krs TEXT,
  ADD COLUMN IF NOT EXISTS kapital_zakladowy NUMERIC,
  ADD COLUMN IF NOT EXISTS kapital_akcyjny NUMERIC,
  ADD COLUMN IF NOT EXISTS opp_status BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS founded_at DATE,
  ADD COLUMN IF NOT EXISTS bankruptcy_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS liquidation_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS restructuring_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS branch_offices_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_filing_date DATE,
  ADD COLUMN IF NOT EXISTS rejestrio_org_id BIGINT,
  ADD COLUMN IF NOT EXISTS employees_count INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_rejestrio_org_id_uniq
  ON clients(rejestrio_org_id)
  WHERE rejestrio_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_red_flags
  ON clients(bankruptcy_flag, liquidation_flag, restructuring_flag)
  WHERE bankruptcy_flag OR liquidation_flag OR restructuring_flag;
