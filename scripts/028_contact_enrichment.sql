-- 028_contact_enrichment.sql
-- Sprint H / Commit 1: Apify contact enrichment storage.
--
-- Note: spec called це "Migration 027" але 027 уже used by Sprint G
-- ai_rescore. Renumber до 028.
--
-- Stores contact details (phone/email/website) fetched з external sources
-- (currently Apify Google Maps; future: Apify LinkedIn, manual). One row per
-- (target, source). 30-day expiry — refresh schedule.
--
-- write-back pattern: 1 Apify call per unique NIP, але INSERT row для KAŻDEGO
-- target_id з тим NIP (client + prospect overlap case — same human).
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS contact_enrichment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('client', 'prospect')),
  target_id UUID NOT NULL,
  source TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  website TEXT,
  gmaps_url TEXT,
  gmaps_rating NUMERIC(2,1),
  gmaps_reviews_count INTEGER,
  raw_payload JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'no_match', 'partial', 'error')),
  error_message TEXT,
  cost_usd NUMERIC(8,4) NOT NULL DEFAULT 0,
  enriched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  UNIQUE (target_type, target_id, source)
);

CREATE INDEX IF NOT EXISTS idx_contact_target
  ON contact_enrichment(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_contact_freshness
  ON contact_enrichment(expires_at) WHERE status = 'success';
CREATE INDEX IF NOT EXISTS idx_contact_source
  ON contact_enrichment(source);
CREATE INDEX IF NOT EXISTS idx_contact_enriched_at
  ON contact_enrichment(enriched_at DESC);

ALTER TABLE contact_enrichment ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "contact_enrichment_authenticated_all" ON contact_enrichment
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE contact_enrichment IS
  'Contact details (phone/email/website) fetched з external sources.
   One row per (target_type, target_id, source). 30-day expiry → refresh.
   Apify Google Maps (compass actor) — primary source. Future: linkedin, manual.
   Write-back pattern: 1 Apify call per unique NIP — но INSERT row на KOŻДЕГО
   target з тим NIP (client+prospect overlap → 2 rows, same payload).';
COMMENT ON COLUMN contact_enrichment.source IS
  'apify_gmaps | apify_linkedin (future) | manual (UI override)';
COMMENT ON COLUMN contact_enrichment.status IS
  'success: ≥1 contact field populated; no_match: search returned 0 places;
   partial: place found але phone+email+website всі NULL; error: API/network fail';
