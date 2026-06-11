-- ============================================================
-- 084_contact_source_catalog.sql
-- Fix D (11.06.2026) — kontakty z katalogów do client_contact_methods.
--
-- Stary CHECK na source dopuszczał tylko stałą listę. Krok ekstrakcji
-- kontaktów z katalogów (jadlodawcy.pl itp.) zapisuje source='catalog:<domena>'
-- → potrzebny relaks constraintu (zachowując dotychczasowe wartości).
--
-- Idempotentna (DROP IF EXISTS + ADD).
-- ============================================================

ALTER TABLE client_contact_methods
  DROP CONSTRAINT IF EXISTS client_contact_methods_source_check;

ALTER TABLE client_contact_methods
  ADD CONSTRAINT client_contact_methods_source_check
  CHECK (
    source = ANY (ARRAY[
      'manual', 'migration_seed', 'KRS', 'WWW',
      'website_scrape', 'apify_gmaps', 'tavily_brand'
    ])
    OR source LIKE 'catalog:%'
  );

-- ============================================================
-- END 084
-- ============================================================
