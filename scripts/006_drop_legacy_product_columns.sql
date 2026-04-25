-- Sprint 2 / Phase 2 cleanup: drop legacy v0 product columns.
-- Run after refactor commits deployed and UI verified.
-- DROP IF EXISTS makes this safe to re-run.
ALTER TABLE products
  DROP COLUMN IF EXISTS koszt_eur,
  DROP COLUMN IF EXISTS koszt_pln,
  DROP COLUMN IF EXISTS weight,
  DROP COLUMN IF EXISTS price_maly,
  DROP COLUMN IF EXISTS price_katalog,
  DROP COLUMN IF EXISTS price_docel,
  DROP COLUMN IF EXISTS zysk_maly,
  DROP COLUMN IF EXISTS zysk_duzy;
