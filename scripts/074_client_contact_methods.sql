-- ============================================================
-- 074_client_contact_methods.sql
-- Sprint TYDZIEN2.T2.4.A (28.05.2026)
--
-- Multi-row firm-level contact methods (email/phone/website/socials).
-- Distinct from `contacts` table (decision-makers з name REQUIRED).
-- Distinct from `company_profile_fields` (single active per field_key).
--
-- Cohabits z 3-layer model:
--   1. clients.email/phone/website — single-value denormalized cache
--      (list + edit form read here, T2.1 sync hook maintains z cpf).
--   2. company_profile_fields — append-only canonical, 1 active per key.
--   3. client_contact_methods (THIS) — multi-row, manual + seeded.
--      UI Kontakt section reads list (primary + N additional).
--
-- RLS: auth.uid() = owner_id (consistent z clients/contacts pattern).
-- T2.2 BUGFIX pokazał что service-role-only deny (jak orders) → friction
-- (admin client wszędzie). Tu Vadym single-user, RLS permissive natywne.
--
-- T2.4.B: ContactSectionV3 read-only UI display (group by kind).
-- T2.4.C: write actions (add/edit/delete/setPrimary з sync до clients.*).
-- All atomic у jednej migration file (single transaction via Management API).
-- ============================================================

CREATE TABLE IF NOT EXISTS client_contact_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- owner_id FK to auth.users — dla RLS auth.uid()=owner_id pattern.
  -- Seed kopiuje z clients.owner_id. UI INSERT z (await getUser()).id.
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'email', 'phone', 'website', 'facebook', 'instagram', 'linkedin', 'other'
  )),
  value TEXT NOT NULL,
  -- Free-text label (np. 'biuro', 'sprzedaż', 'kierownik', 'sklep Wrocław').
  -- NULL = unlabeled main contact.
  label TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  -- Source provenance — manual = user via UI, inne tracked z enrichment.
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN (
    'manual',          -- user-entered via UI
    'migration_seed',  -- from clients.* during T2.4.A seed
    'KRS',             -- z clients.email_krs / website_krs
    'WWW',             -- naive Tavily (cpf source WWW)
    'website_scrape',  -- regex extraction
    'apify_gmaps',     -- Apify Google Maps actor
    'tavily_brand'     -- brand-aware Tavily
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedupe at DB level — same (client, kind, value) cannot insert twice.
-- Seed używa ON CONFLICT ... DO NOTHING przeciw temu indexowi.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ccm_dedup
  ON client_contact_methods (client_id, kind, value);

-- Exactly 1 primary per (client, kind) — T2.4.C setPrimary atomically swap.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ccm_one_primary
  ON client_contact_methods (client_id, kind)
  WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS idx_ccm_client
  ON client_contact_methods (client_id);

CREATE INDEX IF NOT EXISTS idx_ccm_owner
  ON client_contact_methods (owner_id);

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE client_contact_methods ENABLE ROW LEVEL SECURITY;

-- Single FOR ALL policy (consistent z cohorts/cohort_members pattern,
-- separate select/insert/update/delete byłoby 4 identyczne dla single-user).
CREATE POLICY ccm_owner_all ON client_contact_methods
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

COMMENT ON TABLE client_contact_methods IS
  'Multi-row firm-level contact methods (email/phone/website/socials). Sprint TYDZIEN2.T2.4. Distinct z contacts (decision-makers) i company_profile_fields (canonical 1-per-key).';
COMMENT ON COLUMN client_contact_methods.kind IS
  'Method type. email/phone/website/facebook/instagram/linkedin/other.';
COMMENT ON COLUMN client_contact_methods.label IS
  'Free-text role/location tag — biuro, sprzedaż, kierownik, sklep Wrocław. NULL=unlabeled main.';
COMMENT ON COLUMN client_contact_methods.is_primary IS
  'Main method per kind. UNIQUE INDEX zapewnia max 1 primary per (client_id, kind). T2.4.C setPrimary syncuje з clients.{kind} dla list freshness.';
COMMENT ON COLUMN client_contact_methods.source IS
  'Provenance tag — manual/migration_seed/KRS/WWW/website_scrape/apify_gmaps/tavily_brand.';

-- ============================================================
-- END 074
-- ============================================================
