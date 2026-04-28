-- 017_vat_enrichment.sql
-- Phase 2.7 / Commit 1: VAT Biała Lista enrichment (Ministerstwo Finansów).
--
-- Free public API, no registration required. Provides VAT registration
-- status + bank accounts per NIP. Endpoint:
--   https://wl-api.mf.gov.pl/api/search/nip/{NIP}?date=YYYY-MM-DD
--
-- Schema strategy:
--   - vat_data JSONB — full raw response (audit trail, future fields
--     extraction without re-fetch)
--   - structured columns (vat_status / vat_registered_date /
--     vat_bank_accounts / vat_last_checked) — for indexing + filtering
--     in UI/queries (e.g. "show all Wykreślony"). Redundant z JSONB
--     intentionally — speed > storage.
--
-- Idempotent.

-- ───────── ceidg_prospects ─────────
ALTER TABLE ceidg_prospects ADD COLUMN IF NOT EXISTS vat_data JSONB;
ALTER TABLE ceidg_prospects ADD COLUMN IF NOT EXISTS vat_status TEXT;
ALTER TABLE ceidg_prospects ADD COLUMN IF NOT EXISTS vat_registered_date DATE;
ALTER TABLE ceidg_prospects ADD COLUMN IF NOT EXISTS vat_bank_accounts TEXT[];
ALTER TABLE ceidg_prospects ADD COLUMN IF NOT EXISTS vat_last_checked TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ceidg_prospects_vat_status_idx
  ON ceidg_prospects(vat_status);
CREATE INDEX IF NOT EXISTS ceidg_prospects_vat_last_checked_idx
  ON ceidg_prospects(vat_last_checked) WHERE vat_last_checked IS NOT NULL;

COMMENT ON COLUMN ceidg_prospects.vat_status IS
  'VAT registration status z wl-api.mf.gov.pl: Czynny / Zwolniony / Niezarejestrowany / Wykreślony / null (not checked yet).';
COMMENT ON COLUMN ceidg_prospects.vat_data IS
  'Full raw response z VAT Biała Lista API (subject object + requestId/requestDateTime). Audit trail + future field extraction.';

-- ───────── clients ─────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vat_data JSONB;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vat_status TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vat_registered_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vat_bank_accounts TEXT[];
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vat_last_checked TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS clients_vat_status_idx
  ON clients(vat_status);
CREATE INDEX IF NOT EXISTS clients_vat_last_checked_idx
  ON clients(vat_last_checked) WHERE vat_last_checked IS NOT NULL;
