-- ============================================================
-- 105_contact_source_portal.sql
-- Fix (10.09.2026) — portal klienta: dodawanie kontaktu przez klienta.
--
-- Bug: portalUpsertContact (app/portal/data-actions.ts) wstawia
-- source='portal' (uczciwe pochodzenie danych — wpis samego klienta),
-- ale CHECK client_contact_methods_source_check nie zawierał 'portal'
-- → KAŻDY klient portalu dostawał błąd constraintu i NIE mógł dodać
-- kontaktu (dotyczyło też produkcji).
--
-- Fix: relaks constraintu o 'portal' (zachowując dotychczasowe wartości
-- i wzorzec 'catalog:%' z migracji 084). Zmiana czysto addytywna.
-- Idempotentna (DROP IF EXISTS + ADD).
-- ============================================================

ALTER TABLE client_contact_methods
  DROP CONSTRAINT IF EXISTS client_contact_methods_source_check;

ALTER TABLE client_contact_methods
  ADD CONSTRAINT client_contact_methods_source_check
  CHECK (
    source = ANY (ARRAY[
      'manual', 'migration_seed', 'KRS', 'WWW',
      'website_scrape', 'apify_gmaps', 'tavily_brand', 'portal'
    ])
    OR source LIKE 'catalog:%'
  );

-- ============================================================
-- END 105
-- ============================================================
