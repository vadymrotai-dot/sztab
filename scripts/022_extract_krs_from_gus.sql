-- Extract krs_number з gus_data (legal entity records, praw_* fields).
-- Multiple possible field names — COALESCE. Trim leading zeros NIE робимо
-- bo KRS numbers ZAVZHDY 10-digit padded (e.g. 0000006865).
--
-- Our 10 currently-enriched ceidg_prospects = all JDG (fiz_*), no KRS
-- expected. This UPDATE applies forward when sp. z o.o. records added.

UPDATE ceidg_prospects
SET krs_number = COALESCE(
  gus_data->'report'->'root'->'dane'->>'praw_numerWRejestrzeEwidencji',
  gus_data->'report'->'root'->'dane'->>'praw_numerKRS',
  gus_data->'report'->'root'->'dane'->>'praw_NumerNipWRejestrzeEwidencji'
)
WHERE gus_data IS NOT NULL
  AND krs_number IS NULL;

UPDATE clients
SET krs_number = COALESCE(
  gus_data->'report'->'root'->'dane'->>'praw_numerWRejestrzeEwidencji',
  gus_data->'report'->'root'->'dane'->>'praw_numerKRS',
  gus_data->'report'->'root'->'dane'->>'praw_NumerNipWRejestrzeEwidencji'
)
WHERE gus_data IS NOT NULL
  AND krs_number IS NULL;
