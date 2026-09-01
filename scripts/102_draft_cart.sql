-- 102_draft_cart.sql — Zapamiętany koszyk (autosave draftu).
-- Pełny serializowalny stan OrderForm (pozycje + punkty + tryby + kontakt)
-- trzymany jako jsonb na draft-zamówieniu. Ceny NIE są tu zapisywane —
-- liczone na żywo przy wczytaniu. Czyszczone (=NULL) po udanym submit.

alter table orders add column if not exists draft_cart jsonb;
