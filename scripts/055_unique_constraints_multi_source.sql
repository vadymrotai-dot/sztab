-- Migration 055: multi-source prospect schema (CEIDG + KRS)
-- Per Phase 2.8 wire 2026-05-03 evening.
--
-- Note: Originally numbered 022 in spec — bumped to 055 because 022_*
-- already exists (022_extract_krs_from_gus.sql). Latest pre-existing:
-- 054_fix_commodity_uniqueness.sql.
--
-- Problem: ceidg_id NOT NULL UNIQUE blocks KRS-only inserts.
-- KRS firms (sp.z o.o./S.A.) don't have ceidg_id — only krs_number.
--
-- Fix:
--   1. Drop NOT NULL on ceidg_id (semantic: optional per-firma).
--      Existing CEIDG rows have ceidg_id non-null → DROP NOT NULL safe.
--   2. Add partial UNIQUE on krs_number (WHERE NOT NULL) to enable
--      ON CONFLICT (krs_number) DO UPDATE in KRS bootstrap. PostgreSQL
--      docs: partial unique index serves як ON CONFLICT target tak długo,
--      jak rows у insert spełniają predykat. Wszystkie KRS rows mają
--      krs_number IS NOT NULL → constraint pasuje.
--   3. NIP UNIQUE — NOT added. Polish reality: 1 NIP może mieć CEIDG
--      JDG record + KRS sp.z o.o. record dla transformation cases
--      (WYLACZNIE_W_FORMIE_SPOLKI). Hold istniejący nie-unique index.
--
-- Idempotent.

ALTER TABLE ceidg_prospects
  ALTER COLUMN ceidg_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ceidg_prospects_krs_number_uniq
  ON ceidg_prospects(krs_number)
  WHERE krs_number IS NOT NULL;

COMMENT ON COLUMN ceidg_prospects.ceidg_id IS
  'CEIDG firma.id (UUID string). NULL для KRS-only firms (per migration 055). Unique partial index ceidg_prospects_ceidg_id_uniq.';

COMMENT ON COLUMN ceidg_prospects.krs_number IS
  'KRS number 10-digit. Unique partial WHERE NOT NULL (per migration 055) enables ON CONFLICT target у sync-krs-bootstrap.ts.';
