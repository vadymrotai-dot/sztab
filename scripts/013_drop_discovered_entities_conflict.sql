-- 013_drop_discovered_entities_conflict.sql
-- Sprint v2.1 / Hotfix 1: drop partial unique (nip, owner_id) WHERE nip
-- IS NOT NULL na discovered_entities.
--
-- Powód: index forsował user-wide unique pool (jeden NIP per owner ever),
-- co kolidowało z modelem "history per run". Dodatkowo Postgres ON CONFLICT
-- na partial unique wymaga WHERE clause w specyfikacji konfliktu, czego
-- Supabase JS client nie potrafi przekazać przez `onConflict: 'nip,owner_id'`
-- — efekt: "no unique or exclusion constraint matching the ON CONFLICT
-- specification".
--
-- Po hotfixie: discovered_entities trzymane jako historia per run,
-- duplikaty NIP między runami są OK (każdy run = osobna sesja). Server
-- action robi in-memory dedupe per run przed insertem.
--
-- Idempotent.
DROP INDEX IF EXISTS discovered_entities_nip_owner_uniq;

COMMENT ON TABLE discovered_entities IS
  'History of B2B leads discovered per intelligence_run. NIP duplicates between runs are OK (different exploration sessions). In-run dedupe odbywa się client-side w server action before insert.';
