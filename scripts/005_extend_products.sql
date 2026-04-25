-- Sprint 2 / Phase 2 prerequisite: add vat_rate to products. Idempotent.
ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(4,3) NOT NULL DEFAULT 0.05;

DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_vat_rate_check CHECK (vat_rate >= 0 AND vat_rate <= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
