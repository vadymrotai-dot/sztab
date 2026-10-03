-- 111_bgk_companies_fields.sql — bgk_companies: realne kolumny leadu BGK, bo
-- okazało się po realnym probe pliku BGK_TESTOWA_PACZKA_100.csv, że kolumny
-- 110 (zarzad/beneficjent/krs/regon/...) to tylko część danych — brakowało
-- najważniejszych dla partnera: Tier, kwota poręczenia, kontakt (telefon/
-- e-mail/www/osoba decyzyjna), status VAT, wielkość, staż. Reszta (region,
-- źródła, kompletność) zostaje w raw_data (już istniejące jsonb z 110).
--
-- Additive, bez ryzyka — same nowe nullable kolumny na istniejącej (pustej
-- jeszcze) tabeli.

begin;

alter table public.bgk_companies
  add column if not exists size_category     text,   -- Wielkość
  add column if not exists region_teryt       text,   -- Region (TERYT)
  add column if not exists registered_at      date,   -- Data rejestracji
  add column if not exists tenure_months      integer, -- Staż (miesiące)
  add column if not exists tenure_source      text,   -- Źródło stażu
  add column if not exists bgk_guarantee_date date,   -- Data poręczenia BGK
  add column if not exists amount_gross_pln   numeric, -- Kwota brutto PLN
  add column if not exists tier              text,   -- Tier
  add column if not exists vat_status         text,   -- Status VAT
  add column if not exists decision_person    text,   -- Osoba decyzyjna
  add column if not exists decision_function  text,   -- Funkcja
  add column if not exists phone              text,   -- Telefon
  add column if not exists email              text,   -- E-mail
  add column if not exists website            text,   -- Strona WWW
  add column if not exists contact_source     text,   -- Źródło kontaktu
  add column if not exists completeness       text,   -- Kompletność
  add column if not exists krs_search_email    text;   -- E-mail (wyszukiwarka-krs)

commit;
