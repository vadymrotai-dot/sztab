-- 061_recreate_scored_prospects_view.sql
-- Phase 2 Krok 1.A BUGFIX (08.05.2026 evening) — fix scored_prospects view
-- стало missing 11 columns added post-migration 020.
--
-- Bug: migration 020 used `SELECT p.*` and comment claimed "future column
-- adds auto-propagate". Wrong! Postgres expands `*` to literal column list
-- AT view creation time. Subsequent ALTERs to ceidg_prospects (021/033/056)
-- did NOT propagate to view. Result:
--   /intelligence/prospects?type=spzoo crash —
--   "column scored_prospects.krs_legal_form does not exist"
--
-- Fix: explicit column list (mirror 015 pattern). New columns require new
-- migration з CREATE OR REPLACE. View captures schema snapshot at this
-- migration moment.
--
-- Columns now exposed (67 total):
--   29 з ceidg_prospects 014 (origin)
--    5 vat_* (017)
--    8 gus_* (018a)
--    9 krs_* (021)              ← previously missing
--    1 business_profile (033)   ← previously missing
--    1 decision_maker_name (056) ← previously missing
--   13 scoring з ceidg_prospect_scores (015)
--    1 has_contact computed
--
-- security_invoker=true preserved (RLS з base tables apply).
-- Idempotent (DROP IF EXISTS + CREATE OR REPLACE).

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
  -- VAT enrichment 017 (5 columns)
  p.vat_data,
  p.vat_status,
  p.vat_registered_date,
  p.vat_bank_accounts,
  p.vat_last_checked,
  -- GUS enrichment 018a (8 columns)
  p.gus_data,
  p.employee_count_range,
  p.gus_status,
  p.registered_date,
  p.pkd_codes,
  p.gus_legal_name,
  p.gus_regon,
  p.gus_last_checked,
  -- KRS overlay 021 (9 columns) — POPRZEDNIO BRAKOWAŁY
  p.krs_number,
  p.krs_data,
  p.krs_full_name,
  p.krs_legal_form,
  p.krs_registration_date,
  p.krs_management_board,
  p.krs_pkd_with_descriptions,
  p.krs_status,
  p.krs_last_checked,
  -- Business profile AI 033 (1 column) — POPRZEDNIO BRAKOWAŁA
  p.business_profile,
  -- Phase 2.8 KRS Variant B 056 (1 column) — POPRZEDNIO BRAKOWAŁA
  p.decision_maker_name,
  -- ceidg_prospect_scores 015 (13 scoring columns)
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
  'Convenience JOIN ceidg_prospects + ceidg_prospect_scores з computed has_contact. EXPLICIT column list — Postgres views snapshot SELECT * AT CREATION TIME (migration 020 comment про "auto-propagate" БУЛО WRONG). Future column adds require new CREATE OR REPLACE migration. security_invoker=true preserves RLS з base tables. Per Phase 2 Krok 1.A bugfix 08.05.2026.';
