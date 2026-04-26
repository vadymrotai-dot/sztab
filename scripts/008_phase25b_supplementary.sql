-- Phase 2.5b: import_preset для re-import без re-mapping + product tags для clean-label/bestseller/sezon
-- Idempotent.

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS import_preset JSONB;
COMMENT ON COLUMN suppliers.import_preset IS 'Saved column mapping для Excel/CSV import. Schema: {columns: {name: "B", ean: "I", ...}, options: {has_category_headers: true, header_row: 18}}';

ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.tags IS 'Free-form tags: bestseller, clean_label, sezon, top, тощо. Не enum — гнучкість важливіша.';

CREATE INDEX IF NOT EXISTS products_tags_gin_idx ON products USING gin(tags);

-- Backfill з seed: hero=true → tags містить 'bestseller'; seasonality_status='out_of_stock' → 'oos'.
UPDATE products
SET tags = array_append(tags, 'bestseller')
WHERE is_hero = true AND NOT ('bestseller' = ANY(tags));
