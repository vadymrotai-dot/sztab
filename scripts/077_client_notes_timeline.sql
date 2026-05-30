-- ============================================================
-- 077_client_notes_timeline.sql
-- Sprint TYDZIEN2.T2.6 (29.05.2026)
--
-- Rozszerza client_notes (T2.5, migracja 076) o 2 kolumny dla feature
-- "Historia interakcji" — timeline orders + notatek z typami.
--
-- DECYZJA Variant C (z STEP 0 audit T2.6):
--   Zamiast nowej tabeli `client_interactions` — extend istniejący
--   client_notes o `kind` enum + `occurred_at` (NULL = fallback do
--   created_at). T2.5 inline UI pracuje dalej (kind DEFAULT 'note',
--   stare nottakі widoczne jak dotychczas).
--
-- kind values:
--   'note'           — domyślne, wolny tekst (T2.5 baseline)
--   'call'           — rozmowa telefoniczna
--   'meeting'        — spotkanie / wizyta
--   'order_followup' — przypomnienie / follow-up dot. zamówienia
--
-- occurred_at:
--   NULL — fallback to created_at (kompatybilność z 200 zsedovanyмi
--   notami T2.5, гdzie nie wiemy kiedy faktycznie wydarzyła się rzecz)
--   NOT NULL — explicit data zdarzenia (user wpisuje "rozmowa z poniedziałku"
--   dziś — occurred_at = poniedziałek, created_at = dziś)
--
-- T2.6.B: lib/timeline/build-events.ts — UNION orders + client_notes
-- T2.6.C: components/clients/client-timeline-section.tsx — UI
-- T2.6.D: AccordionSection id="historia" w page.tsx (after Profil)
-- ============================================================

-- ─── 1. ADD COLUMN kind ──────────────────────────────────────────────
ALTER TABLE client_notes
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'note';

-- CHECK constraint — separate ALTER bo dodawanie CHECK do ADD COLUMN
-- z DEFAULT pre-zfailuje gdy seed rows mają wartość niepasującą.
-- DEFAULT 'note' zapewnia wszystkie istniejące rows = 'note' przed CHECK.
ALTER TABLE client_notes
  DROP CONSTRAINT IF EXISTS client_notes_kind_check;

ALTER TABLE client_notes
  ADD CONSTRAINT client_notes_kind_check
  CHECK (kind IN ('note', 'call', 'meeting', 'order_followup'));

-- ─── 2. ADD COLUMN occurred_at ───────────────────────────────────────
ALTER TABLE client_notes
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;

-- ─── 3. Index dla timeline sortowania ────────────────────────────────
-- Timeline ORDER BY COALESCE(occurred_at, created_at) DESC — index
-- na expression speedup query (pomiędzy notatek + orders union to
-- typowo <100 rows per klient, ale i tak warto).
CREATE INDEX IF NOT EXISTS idx_client_notes_timeline
  ON client_notes (client_id, COALESCE(occurred_at, created_at) DESC);

-- ─── 4. COMMENTs ─────────────────────────────────────────────────────
COMMENT ON COLUMN client_notes.kind IS
  'Typ wpisu w timeline (T2.6). note=wolny tekst (default, T2.5 baseline), call=telefon, meeting=spotkanie, order_followup=przypomnienie o zamowieniu.';
COMMENT ON COLUMN client_notes.occurred_at IS
  'Kiedy zdarzenie faktycznie miało miejsce (T2.6). NULL = fallback do created_at. Pozwala wpisać past event z dokładną datą zdarzenia.';

-- ============================================================
-- END 077
-- ============================================================
