-- Phase 2.5b post-deploy: cost_eur optional, cost_pln primary, supplier default currency hint.
-- Idempotent.

-- 1. cost_eur стає optional (вже nullable у схемі — підтверджуємо comment)
COMMENT ON COLUMN products.cost_eur IS 'Optional. Якщо заповнено — cost_pln рахується автоматично як cost_eur × kurs × overhead. Імпортні товари (ЧМ з UA, TR, NL).';

COMMENT ON COLUMN products.cost_pln IS 'Primary cost truth. Для імпортних — обчислюється з cost_eur. Для PL виробників — вводиться напряму.';

-- 2. supplier default currency hint
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'PLN';
DO $$ BEGIN
  ALTER TABLE suppliers ADD CONSTRAINT suppliers_default_currency_check CHECK (default_currency IN ('PLN', 'EUR'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Проставити EUR для імпортних suppliers (ЧМ + Mod-loszka + майбутні TR)
UPDATE suppliers SET default_currency = 'EUR' WHERE name IN ('Czudowa Marka', 'Mod-loszka');
-- Karol/Gmurczyk/Pikniko — залишаємо PLN default.

-- 4. Validation constraint: при NULL cost_eur, cost_pln має бути NOT NULL > 0 (інакше це broken row)
-- Не додаємо CHECK бо існуючі rows з 0/0 v0 import-у можуть впасти. Це валідуємо у формі.
