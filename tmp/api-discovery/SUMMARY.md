# Sprint S1 Phase 0 — API Discovery Summary

Test target: KOZAK OLEK (KRS=0000977768, NIP=7561993172, REGON=522340602)
Date: 2026-04-30

## rejestr.io v2 (Biznes plan)

| # | Endpoint | Status | Notable shape |
|---|---|---|---|
| 1 | `GET /org/{KRS}` | ✅ 200 | basic top-level org info |
| 2 | `GET /org/{KRS}/krs-rozdzialy/ogolny` | ✅ 200 | **FIELDS WORK FOR EXTRACTION** (see below) |
| 3 | `GET /org/{KRS}/krs-rozdzialy/przeksztalcenia` | ✅ 200 | `informacja_o_sporzadzeniu_lub_zmianie_umowy._obiekty.{N}._wartosc`; bankruptcy/likwidacja keys appear when present (KOZAK has neither) |
| 4 | `GET /org/{KRS}/krs-rozdzialy/wzmianki` | ✅ 200 | `dokumenty_wzmianka_o_zlozeniu_rocznego_sprawozdania_finansowego._obiekty.{N}._wartosc.{data,okres}` — KOZAK has 3 entries (2022, 2023, 2024) |
| 5 | `GET /org/{KRS}/krs-rozdzialy/oddzialy` | ✅ 200 | `body: []` (KOZAK has no oddzialy) |
| 6 | `GET /org/{KRS}/krs-dokumenty` | ✅ 200 | array of years; each year `{data_start, data_koniec, dokumenty: [{czy_ma_json, id, nazwa}]}` |
| 7 | `GET /org/{KRS}/krs-dokumenty/{doc_id}?format=json` | ✅ 200 | XBRL JSON tree under `body.zawartosc` (recursive `podobiekty`) |
| 8 | `GET /org/{KRS}/crbr` | ✅ 200 | array of `{id, kody_krajow_obywatelstwa[], kod_kraju_rezydencji, tozsamosc: {imie, nazwisko, ...}, typ}` |
| 9 | `GET /osoby/{person_id}` | ✅ 200 | **REAL NAMES** `{id, tozsamosc: {imie, nazwisko, plec, data_urodzenia}, organizacje_skrot[], krs_powiazania_liczby}` |
| 10 | `GET /osoby/{person_id}/krs-powiazania?aktualnosc=aktualne` | ✅ 200 | array of orgs з `krs_powiazania_kwerendowane: [{kierunek, opis, typ, data_start, data_koniec}]` |

### KEY FINDING: Biznes plan returns REAL NAMES

`/krs-rozdzialy/ogolny.organ_reprezentacji._obiekty.1.dane_osob._obiekty.{N}.person._wartosc`:
```json
{
  "imie": "Oleksii",
  "nazwisko": "Ilchenko",
  "id": "3008026",
  "plec": "M",
  "data_urodzenia": "1999-02-15"
}
```

KOZAK persons:
- 3008026: Oleksii Ilchenko (PREZES ZARZĄDU, M, 1999-02-15)
- 3008027: Olena Ilchenko (CZŁONEK ZARZĄDU, F, 1971-04-02)

CRBR beneficiaries: same 2 persons, kody_krajow_obywatelstwa=["UA"], kod_kraju_rezydencji="PL".

### KOZAK fields extracted from /krs-rozdzialy/ogolny

- `email._wartosc`: `KOZAK.STRZELCE.OPOLSKIE@GMAIL.COM` ✅
- `adres_znormalizowany._wartosc`: full address з `longitude` + `latitude` ✅
- `forma_prawna._wartosc`: "SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ"
- `opp._wartosc`: false (not a public-benefit org)
- `siedziba._wartosc`: "kraj POLSKA, woj. OPOLSKIE..."
- All fields wrapped у `{_wartosc, _zakres: {wpis_wprowadzajacy_numer, wpis_wprowadzajacy_data}}` для last-modified tracking

### KOZAK financials (from doc 17708354 RZiS 2024)

XBRL tree з `pln_rok_obrotowy_biezacy` + `pln_rok_obrotowy_poprzedni`:
- Przychody netto ze sprzedaży i zrównane z nimi (etykieta="...A..."): **1,850,133.32 PLN** (vs 1,452,978.76 у 2023)
- Koszty działalności operacyjnej (B): 1,700,311.08 PLN

XBRL parser strategy: recursive search у `zawartosc.podobiekty[]` for nodes matching label patterns:
- "Przychody netto ze sprzedaży i zrównane z nimi" → przychody_netto
- "Zysk (strata) netto" → zysk_netto
- "Aktywa razem" (з Bilans doc) → aktywa_razem
- "Przeciętne zatrudnienie" → liczba_pracownikow

## GUS BIR1.1

Token still works з existing `gusLogin`. SilosID for KOZAK = "6" (osoba prawna).

| Report | Status | Notable shape |
|---|---|---|
| BIR11TypPodmiotu | ✅ 200 | `{Typ_Podmiotu, ...}` |
| BIR11OsPrawna | ✅ 200 | `{praw_adresEmail (empty for KOZAK), praw_adresStronyinternetowej (empty), praw_adSiedz*..., praw_podstawowaFormaPrawna_Symbol, praw_szczegolnaFormaPrawna_Symbol, ...}` |
| BIR11OsPrawnaPkd | ✅ 200 | array of `{praw_pkdKod, praw_pkdNazwa, praw_pkdPrzewazajace}` — KOZAK has 120 PKD codes з `4719Z` jako przewazajace |
| BIR11OsPrawnaListaJednLokalnych | ✅ 200 (empty) | Returns ErrorCode 4 "Nie znaleziono" — KOZAK has no jednostki lokalne. Need handle empty case у parser. |

## Conclusions для Phase 1+

1. **No 401/403 anywhere** — credentials work, all 10+5 endpoints return data.
2. **Biznes-only fields confirmed**: real person names + dates, CRBR beneficiaries, full XBRL JSON.
3. **Empty results normal**: oddzialy=[], jednostki lokalne=ErrorCode 4 — parsers must handle gracefully.
4. **Field shape pattern для rozdzial-ogolny**: every value wrapped у `{_wartosc, _zakres}` — extractor needs to unwrap.
5. **XBRL recursive structure** confirmed — etykieta-matching strategy works.
6. **`_obiekty.{N}` keying** is dynamic (1, 5, 6, etc.) — iterate Object.values() rather than indexed access.
