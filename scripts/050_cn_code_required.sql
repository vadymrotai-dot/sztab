-- Sprint S-INTEL.1.1.5 — ALTER cn_code SET NOT NULL.
--
-- ⚠️  WARNING: Цей migration RUN ONLY ПІСЛЯ того як Vadym review-нув всі
-- backfill suggestions через UI (clear cn_code_review_pending flags).
-- Якщо ANY product має cn_code=NULL коли запускаєш — ALTER падає.
--
-- Pre-flight checks (run у Supabase SQL Editor перш ніж apply цього файла):
--
--   SELECT COUNT(*) FROM products WHERE cn_code IS NULL;
--   -- Має бути: 0
--
--   SELECT COUNT(*) FROM products WHERE cn_code_review_pending = TRUE;
--   -- Має бути: 0 (всі AI suggestions reviewed + cleared by save edit)
--
--   SELECT id, name, cn_code, cn_code_review_pending
--   FROM products
--   WHERE cn_code IS NULL OR cn_code_review_pending = TRUE
--   ORDER BY name;
--   -- Має бути: empty result set
--
-- Якщо все OK — apply цей файл.

ALTER TABLE products ALTER COLUMN cn_code SET NOT NULL;

COMMENT ON COLUMN products.cn_code IS
  '8-digit EU Combined Nomenclature classification без spaces (regex ^[0-9]{8}$). Bridge to TARIC/Eurostat Comext/ZSRIR/fresh-market.pl. NOT NULL constraint enforced after S-INTEL.1.1.5 backfill review (Vadym manual approve через ProductForm).';
