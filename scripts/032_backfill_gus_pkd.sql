-- 032_backfill_gus_pkd.sql
-- Sprint L Phase 1C — backfill PKD codes з clients.gus_data.pkd raw payload
-- to: (a) clients.pkd_codes legacy column, (b) company_profile_fields canonical.
--
-- Root cause був typo: GUS extractor read `praw_pkd_Kod` (з underscore)
-- але actual field name is `praw_pkdKod` (без underscore). 54 clients
-- mali GUS data fetched з 2026-04 але pkd_codes column was empty {}.
--
-- Цей migration extracts codes from JSONB raw payload directly. Idempotent.

-- 1. Update clients.pkd_codes legacy column from gus_data.pkd JSONB
UPDATE clients c
SET pkd_codes = sub.codes
FROM (
  SELECT
    c.id AS client_id,
    array_agg(DISTINCT code) FILTER (WHERE code IS NOT NULL) AS codes
  FROM clients c,
  LATERAL (
    SELECT COALESCE(
      dane->>'praw_pkdKod',
      dane->>'fiz_pkdKod',
      dane->>'praw_pkd_Kod',
      dane->>'fiz_pkd_Kod',
      dane->>'pkdKod',
      dane->>'kod'
    ) AS code
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(c.gus_data->'pkd'->'root'->'dane') = 'array'
          THEN c.gus_data->'pkd'->'root'->'dane'
        WHEN jsonb_typeof(c.gus_data->'pkd'->'root'->'dane') = 'object'
          THEN jsonb_build_array(c.gus_data->'pkd'->'root'->'dane')
        ELSE '[]'::jsonb
      END
    ) AS dane
  ) AS extracted
  WHERE c.gus_data IS NOT NULL
    AND c.gus_data->'pkd' IS NOT NULL
  GROUP BY c.id
) sub
WHERE c.id = sub.client_id
  AND sub.codes IS NOT NULL
  AND array_length(sub.codes, 1) > 0
  AND (c.pkd_codes IS NULL OR array_length(c.pkd_codes, 1) IS NULL OR c.pkd_codes = '{}');

-- 2. Mirror to pkd_2007_codes (used by matching engine)
UPDATE clients
SET pkd_2007_codes = pkd_codes
WHERE pkd_codes IS NOT NULL
  AND array_length(pkd_codes, 1) > 0
  AND (pkd_2007_codes IS NULL OR array_length(pkd_2007_codes, 1) IS NULL OR pkd_2007_codes = '{}');

-- 3. Backfill canonical company_profile_fields з legacy column
INSERT INTO company_profile_fields (
  client_id, field_key, value_json, source, source_priority, confidence,
  last_verified_at, created_at
)
SELECT
  c.id,
  'pkd_codes',
  to_jsonb(c.pkd_codes),
  'GUS',
  9,
  1.0,
  COALESCE(c.gus_last_checked, now()),
  COALESCE(c.gus_last_checked, now())
FROM clients c
WHERE c.pkd_codes IS NOT NULL
  AND array_length(c.pkd_codes, 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM company_profile_fields cpf
    WHERE cpf.client_id = c.id
      AND cpf.field_key = 'pkd_codes'
      AND cpf.superseded_at IS NULL
  );

-- 4. Backfill pkd_main canonical field (use Przewazajace=1 marker if present, else first code)
INSERT INTO company_profile_fields (
  client_id, field_key, value_text, source, source_priority, confidence,
  last_verified_at, created_at
)
SELECT
  c.id,
  'pkd_main',
  COALESCE(
    (
      SELECT COALESCE(dane->>'praw_pkdKod', dane->>'fiz_pkdKod', dane->>'praw_pkd_Kod', dane->>'fiz_pkd_Kod')
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(c.gus_data->'pkd'->'root'->'dane') = 'array'
            THEN c.gus_data->'pkd'->'root'->'dane'
          WHEN jsonb_typeof(c.gus_data->'pkd'->'root'->'dane') = 'object'
            THEN jsonb_build_array(c.gus_data->'pkd'->'root'->'dane')
          ELSE '[]'::jsonb
        END
      ) AS dane
      WHERE COALESCE(dane->>'praw_pkdPrzewazajace', dane->>'fiz_pkdPrzewazajace') = '1'
      LIMIT 1
    ),
    c.pkd_codes[1]
  ),
  'GUS',
  9,
  1.0,
  COALESCE(c.gus_last_checked, now()),
  COALESCE(c.gus_last_checked, now())
FROM clients c
WHERE c.pkd_codes IS NOT NULL
  AND array_length(c.pkd_codes, 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM company_profile_fields cpf
    WHERE cpf.client_id = c.id
      AND cpf.field_key = 'pkd_main'
      AND cpf.superseded_at IS NULL
  );

-- Sanity check report
SELECT
  COUNT(*) FILTER (WHERE pkd_codes IS NOT NULL AND array_length(pkd_codes, 1) > 0) AS clients_з_pkd,
  COUNT(*) FILTER (WHERE pkd_2007_codes IS NOT NULL AND array_length(pkd_2007_codes, 1) > 0) AS clients_з_pkd_2007,
  (SELECT COUNT(*) FROM company_profile_fields WHERE field_key = 'pkd_codes' AND superseded_at IS NULL) AS canonical_pkd_codes,
  (SELECT COUNT(*) FROM company_profile_fields WHERE field_key = 'pkd_main' AND superseded_at IS NULL) AS canonical_pkd_main
FROM clients;
