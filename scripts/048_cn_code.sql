-- Sprint S-INTEL.1.1 — CN code foundation (Combined Nomenclature 8-digit).
-- Bridge до TARIC, Eurostat Comext, ZSRIR, fresh-market.pl.
-- NULLABLE спочатку. Backfill у S-INTEL.1.1.5 → потім SET NOT NULL у 050.
--
-- Quality gate: cn_code_review_pending BOOLEAN flag. AI suggester
-- встановлює TRUE; Vadym save edit → clears FALSE. UI badge на /produkty
-- list показує SKU що чекають manual review.
--
-- Idempotent. Safe to re-run.

ALTER TABLE products ADD COLUMN IF NOT EXISTS cn_code TEXT;

DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_cn_code_format
    CHECK (cn_code IS NULL OR cn_code ~ '^[0-9]{8}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS products_cn_code_idx ON products(cn_code);

ALTER TABLE products ADD COLUMN IF NOT EXISTS cn_code_review_pending
  BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS products_cn_code_review_pending_idx
  ON products(cn_code_review_pending)
  WHERE cn_code_review_pending = TRUE;

COMMENT ON COLUMN products.cn_code IS
  '8-digit EU Combined Nomenclature classification без spaces (regex ^[0-9]{8}$). Bridge to TARIC/Eurostat Comext/ZSRIR/fresh-market.pl. NULL initially; backfill via lib/ai/cn-code-suggester.ts у S-INTEL.1.1.5; SET NOT NULL у 050 після Vadym manual review.';

COMMENT ON COLUMN products.cn_code_review_pending IS
  'Quality gate flag. TRUE коли AI suggester задав cn_code, але Vadym ще не review. UI badge на /produkty list. Save edit у ProductForm clears flag (Vadym підтверджує / коригує).';
