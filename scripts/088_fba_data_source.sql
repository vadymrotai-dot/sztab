-- 088_fba_data_source.sql
-- FBA: додає data_source JSONB до fba_prospects.
-- Зберігає звідки прийшло кожне поле (CEIDG / Apollo / LinkedIn / manual).
-- Потрібно для відповіді на RODO art.14 запити підприємців.
-- Idempotent.

ALTER TABLE fba_prospects
  ADD COLUMN IF NOT EXISTS data_source JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN fba_prospects.data_source IS
  'Джерела даних по полях: {"email": "apollo", "telefon": "ceidg", "linkedin_url": "apollo", "name": "ceidg"}. Для відповіді на RODO art.14 запити.';

CREATE INDEX IF NOT EXISTS fba_prospects_data_source_gin
  ON fba_prospects USING gin(data_source);

-- Оновити існуючі записи — всі базові поля прийшли з CEIDG
UPDATE fba_prospects
SET data_source = jsonb_build_object(
  'name', 'ceidg',
  'nip', 'ceidg',
  'owner_name', 'ceidg',
  'status', 'ceidg',
  'pkd_main', 'ceidg',
  'pkd_all', 'ceidg',
  'miejscowosc', 'ceidg',
  'wojewodztwo', 'ceidg',
  'data_rozpoczecia', 'ceidg',
  'email', CASE WHEN email IS NOT NULL THEN 'ceidg' ELSE NULL END,
  'telefon', CASE WHEN telefon IS NOT NULL THEN 'ceidg' ELSE NULL END
)
WHERE data_source = '{}'::jsonb OR data_source IS NULL;
