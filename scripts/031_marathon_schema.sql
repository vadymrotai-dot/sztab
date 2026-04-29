-- 031_marathon_schema.sql
-- Sprint K Marathon / Phase 1: profile architecture + persons entity foundation.
--
-- Note: spec called це "Migration 030" але уже used (Sprint J primary flag).
-- Renumber до 031.
--
-- 8 нових tables:
--   • persons — first-class entity (не атрибут company)
--   • person_company_links — many-to-many з ролями
--   • person_events — birthday/imieniny/rocznice з reminders
--   • company_profile_fields — canonical fields з source attribution
--   • enrichment_log — append-only event store of all enrichment runs
--   • bzp_tenders — wins і active тендери з BZP
--   • company_financials — sprawozdania finansowe roczne
--   • msig_changes — формальні зміни з Monitor Sądowy i Gospodarczy
--
-- Idempotent.

-- ─────── 1. persons ───────
CREATE TABLE IF NOT EXISTS persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imie TEXT NOT NULL,
  nazwisko TEXT NOT NULL,
  email_glowny TEXT,
  email_prywatny TEXT,
  telefon_komorkowy TEXT,
  linkedin_url TEXT,
  data_urodzenia DATE,
  miesiac_urodzenia INT CHECK (miesiac_urodzenia BETWEEN 1 AND 12),
  dzien_urodzenia INT CHECK (dzien_urodzenia BETWEEN 1 AND 31),
  zainteresowania TEXT[] NOT NULL DEFAULT '{}',
  mocne_strony TEXT[] NOT NULL DEFAULT '{}',
  notatki_wewnetrzne TEXT,
  zrodla_pol JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_persons_email
  ON persons(email_glowny) WHERE email_glowny IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_persons_linkedin
  ON persons(linkedin_url) WHERE linkedin_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_persons_birthday_md
  ON persons(miesiac_urodzenia, dzien_urodzenia)
  WHERE miesiac_urodzenia IS NOT NULL;

ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "persons_authenticated_all" ON persons
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION persons_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS persons_updated_at ON persons;
CREATE TRIGGER persons_updated_at BEFORE UPDATE ON persons
  FOR EACH ROW EXECUTE FUNCTION persons_set_updated_at();

COMMENT ON TABLE persons IS
  'First-class entity для людей. zrodla_pol JSONB tracks per-field source
   ({birthday: ''manual'', email: ''WWW''}). data_urodzenia може бути NULL з
   miesiac/dzien populated (rok unknown — common case).';

-- ─────── 2. person_company_links ───────
-- XOR client_id/prospect_id з partial UNIQUE indexes для dedup.
CREATE TABLE IF NOT EXISTS person_company_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES ceidg_prospects(id) ON DELETE CASCADE,
  CONSTRAINT person_company_links_target_xor CHECK (
    (client_id IS NULL) <> (prospect_id IS NULL)
  ),
  rola TEXT NOT NULL,
  data_od DATE,
  data_do DATE,
  jest_decyzyjny BOOLEAN NOT NULL DEFAULT FALSE,
  sila_relacji INT NOT NULL DEFAULT 0
    CHECK (sila_relacji BETWEEN 0 AND 100),
  zrodlo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS person_company_links_client_uniq
  ON person_company_links(person_id, client_id, rola, COALESCE(data_od, '1900-01-01'::date))
  WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS person_company_links_prospect_uniq
  ON person_company_links(person_id, prospect_id, rola, COALESCE(data_od, '1900-01-01'::date))
  WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pcl_client_id
  ON person_company_links(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pcl_prospect_id
  ON person_company_links(prospect_id) WHERE prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pcl_person_current
  ON person_company_links(person_id) WHERE data_do IS NULL;

ALTER TABLE person_company_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "pcl_authenticated_all" ON person_company_links
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────── 3. person_events ───────
CREATE TABLE IF NOT EXISTS person_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  typ TEXT NOT NULL CHECK (typ IN (
    'urodziny','imieniny','rocznica_pracy','rocznica_firmy',
    'nagroda','awans','wystąpienie','inne'
  )),
  data DATE,
  miesiac INT CHECK (miesiac BETWEEN 1 AND 12),
  dzien INT CHECK (dzien BETWEEN 1 AND 31),
  opis TEXT,
  repeat_yearly BOOLEAN NOT NULL DEFAULT FALSE,
  zrodlo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_md
  ON person_events(miesiac, dzien) WHERE repeat_yearly = TRUE;
CREATE INDEX IF NOT EXISTS idx_events_person
  ON person_events(person_id);
CREATE INDEX IF NOT EXISTS idx_events_data
  ON person_events(data) WHERE data IS NOT NULL;

ALTER TABLE person_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "person_events_authenticated_all" ON person_events
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────── 4. company_profile_fields ───────
-- Source-attributed canonical fields. Append-only з superseded marker.
CREATE TABLE IF NOT EXISTS company_profile_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES ceidg_prospects(id) ON DELETE CASCADE,
  CONSTRAINT cpf_target_xor CHECK (
    (client_id IS NULL) <> (prospect_id IS NULL)
  ),
  field_key TEXT NOT NULL,
  value_text TEXT,
  value_number NUMERIC,
  value_json JSONB,
  source TEXT NOT NULL,
  source_priority INT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.0
    CHECK (confidence BETWEEN 0 AND 1),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at TIMESTAMPTZ,
  superseded_by_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cpf_target_field_active_uniq
  ON company_profile_fields(COALESCE(client_id, prospect_id), field_key)
  WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cpf_client
  ON company_profile_fields(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cpf_prospect
  ON company_profile_fields(prospect_id) WHERE prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cpf_source
  ON company_profile_fields(source);

ALTER TABLE company_profile_fields ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "cpf_authenticated_all" ON company_profile_fields
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE company_profile_fields IS
  'Canonical company profile з source attribution per field. Append-only:
   updates set superseded_at, INSERT новий row. Active row per (target, field)
   = WHERE superseded_at IS NULL. Source priorities (KRS=10, GUS=9, CEIDG=8,
   VAT_BL=7, BZP=6, Manual=5, Apify=4, AI=3) drive merge logic у lib/profile/merge.ts.';

-- ─────── 5. enrichment_log ───────
CREATE TABLE IF NOT EXISTS enrichment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('company', 'person')),
  target_id UUID NOT NULL,
  source TEXT NOT NULL,
  run_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'error')),
  fields_added TEXT[] NOT NULL DEFAULT '{}',
  fields_updated TEXT[] NOT NULL DEFAULT '{}',
  fields_unchanged TEXT[] NOT NULL DEFAULT '{}',
  raw_payload JSONB,
  error_message TEXT,
  cost_usd NUMERIC(8,4) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_enrichment_log_target
  ON enrichment_log(target_type, target_id, run_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrichment_log_source
  ON enrichment_log(source, run_started_at DESC);

ALTER TABLE enrichment_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "enrichment_log_authenticated_all" ON enrichment_log
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────── 6. bzp_tenders ───────
CREATE TABLE IF NOT EXISTS bzp_tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bzp_notice_id TEXT UNIQUE NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  prospect_id UUID REFERENCES ceidg_prospects(id) ON DELETE SET NULL,
  winner_nip TEXT,
  winner_name TEXT,
  ordering_party TEXT,
  ordering_party_type TEXT,
  cpv_codes TEXT[] NOT NULL DEFAULT '{}',
  subject TEXT,
  award_value_pln NUMERIC,
  award_date DATE,
  contract_period TEXT,
  raw_payload JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bzp_winner_nip ON bzp_tenders(winner_nip)
  WHERE winner_nip IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bzp_cpv ON bzp_tenders USING GIN(cpv_codes);
CREATE INDEX IF NOT EXISTS idx_bzp_client ON bzp_tenders(client_id)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bzp_prospect ON bzp_tenders(prospect_id)
  WHERE prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bzp_award_date ON bzp_tenders(award_date DESC)
  WHERE award_date IS NOT NULL;

ALTER TABLE bzp_tenders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "bzp_authenticated_all" ON bzp_tenders
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────── 7. company_financials ───────
CREATE TABLE IF NOT EXISTS company_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES ceidg_prospects(id) ON DELETE CASCADE,
  CONSTRAINT financials_target_xor CHECK (
    (client_id IS NULL) <> (prospect_id IS NULL)
  ),
  rok INT NOT NULL CHECK (rok BETWEEN 1990 AND 2100),
  przychody_pln NUMERIC,
  zysk_netto_pln NUMERIC,
  marza_netto NUMERIC,
  aktywa_pln NUMERIC,
  kapital_wlasny_pln NUMERIC,
  zatrudnienie INT,
  source_url TEXT,
  filed_at DATE,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS financials_target_year_uniq
  ON company_financials(COALESCE(client_id, prospect_id), rok);
CREATE INDEX IF NOT EXISTS idx_financials_client
  ON company_financials(client_id, rok DESC) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financials_prospect
  ON company_financials(prospect_id, rok DESC) WHERE prospect_id IS NOT NULL;

ALTER TABLE company_financials ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "financials_authenticated_all" ON company_financials
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────── 8. msig_changes ───────
CREATE TABLE IF NOT EXISTS msig_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES ceidg_prospects(id) ON DELETE CASCADE,
  CONSTRAINT msig_target_xor CHECK (
    (client_id IS NULL) <> (prospect_id IS NULL)
  ),
  msig_number TEXT,
  publication_date DATE,
  change_type TEXT,
  description TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msig_client_date
  ON msig_changes(client_id, publication_date DESC) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msig_prospect_date
  ON msig_changes(prospect_id, publication_date DESC) WHERE prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msig_change_type
  ON msig_changes(change_type, publication_date DESC) WHERE change_type IS NOT NULL;

ALTER TABLE msig_changes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "msig_authenticated_all" ON msig_changes
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────── pulpit_today_cache (Phase 6 prep) ───────
CREATE TABLE IF NOT EXISTS pulpit_today_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_date DATE NOT NULL,
  section TEXT NOT NULL,
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pulpit_today_uniq
  ON pulpit_today_cache(cache_date, section);

ALTER TABLE pulpit_today_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "pulpit_authenticated_all" ON pulpit_today_cache
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
