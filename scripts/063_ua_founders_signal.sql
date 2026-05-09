-- 063_ua_founders_signal.sql
-- S-CORE.3.B Phase A (09.05.2026) — Ukrainian-founder detection cache.
--
-- Підкладає ua_founders_signal jsonb на clients + ceidg_prospects.
-- Computed by lib/intelligence/ukrainian-detect.ts (heuristic + CRBR).
-- Backfilled через scripts/backfill-ua-founders.ts (Vadym runs у PowerShell).
--
-- Per Vadym Q5: detected=true ТІЛЬКИ для confidence='verified' (CRBR-confirmed)
-- + 'high' (UK first + UK surname без PL signal). 'medium'/'low' stored з
-- detected=false для debugging.
--
-- Schema:
--   {
--     detected: boolean,
--     confidence: 'verified'|'high'|'medium'|'low'|null,
--     source: 'crbr'|'heuristic'|null,
--     names: text[],
--     signals: text[]
--   }
--
-- Default OFF (no UA filter bias). User opts-in via ?ua_filter=likely|verified
-- URL param на /intelligence/prospects + /produkty TOP-25 section.
--
-- Idempotent. Safe re-run.

-- ─── 1. Add cache columns ──────────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS ua_founders_signal JSONB DEFAULT NULL;

ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS ua_founders_signal JSONB DEFAULT NULL;

-- ─── 2. Indexes для filter performance ────────────────────────────

CREATE INDEX IF NOT EXISTS idx_clients_ua_detected
  ON clients(((ua_founders_signal->>'detected')::boolean))
  WHERE ua_founders_signal IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ceidg_prospects_ua_detected
  ON ceidg_prospects(((ua_founders_signal->>'detected')::boolean))
  WHERE ua_founders_signal IS NOT NULL;

-- ─── 3. Recreate scored_prospects view to expose ua_founders_signal ───
--
-- Per migration 061 lesson: Postgres views snapshot SELECT * AT CREATION.
-- Adding new column to ceidg_prospects не auto-propagate. Explicit list з
-- 68-th column added.
--
-- security_invoker=true preserved (RLS via base tables).

DROP VIEW IF EXISTS scored_prospects;

CREATE OR REPLACE VIEW scored_prospects
WITH (security_invoker = true)
AS
SELECT
  -- ceidg_prospects 014 origin (29 columns)
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
  -- VAT enrichment 017 (5)
  p.vat_data,
  p.vat_status,
  p.vat_registered_date,
  p.vat_bank_accounts,
  p.vat_last_checked,
  -- GUS enrichment 018a (8)
  p.gus_data,
  p.employee_count_range,
  p.gus_status,
  p.registered_date,
  p.pkd_codes,
  p.gus_legal_name,
  p.gus_regon,
  p.gus_last_checked,
  -- KRS overlay 021 (9)
  p.krs_number,
  p.krs_data,
  p.krs_full_name,
  p.krs_legal_form,
  p.krs_registration_date,
  p.krs_management_board,
  p.krs_pkd_with_descriptions,
  p.krs_status,
  p.krs_last_checked,
  -- Business profile 033 (1)
  p.business_profile,
  -- Decision maker 056 (1)
  p.decision_maker_name,
  -- UA founders signal 063 (1) — NEW Phase A
  p.ua_founders_signal,
  -- ceidg_prospect_scores 015 (13 scoring)
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
  -- Computed
  (p.email IS NOT NULL OR p.telefon IS NOT NULL) AS has_contact
FROM ceidg_prospects p
LEFT JOIN ceidg_prospect_scores s ON s.prospect_id = p.id;

COMMENT ON VIEW scored_prospects IS
  'Convenience JOIN ceidg_prospects + ceidg_prospect_scores з computed has_contact + ua_founders_signal (063 Phase A). EXPLICIT column list — Postgres views snapshot SELECT * AT CREATION. security_invoker=true preserves RLS з base tables. Per S-CORE.3.B Phase A 09.05.2026 — added ua_founders_signal column.';

-- ─── Comments ─────────────────────────────────────────────────────

COMMENT ON COLUMN clients.ua_founders_signal IS
  'Cached UA-founder signal computed by lib/intelligence/ukrainian-detect.ts. Per Phase A Q5: detected=true тільки для confidence=verified (CRBR) або high (UK first + UK surname без PL). Backfilled via scripts/backfill-ua-founders.ts.';

COMMENT ON COLUMN ceidg_prospects.ua_founders_signal IS
  'Same shape як clients.ua_founders_signal. CRBR не covers JDG (sole-prop), тому source=crbr дуже rare для prospects — heuristic-only typically.';
