# No-match wrong-match candidates — Day 2 manual review

**Date:** 2026-05-21 16:19 UTC
**Source:** `contact_enrichment` rows з `source=apify_gmaps` AND `status=no_match`
**Total no_match runs scanned:** 59
**Top-3 candidates per run, sorted: cohort first → Jaccard desc**

Vadym review process:
1. Подивись sim score + categoryName + city
2. Якщо correct match (наприклад same brand, same city) — mark як ✓ → contact data можна promote manually
3. Якщо wrong (як Continental Opony для Continental Group PL hurtownia) — mark ✗ → skip
4. Cohort клієнти позначені [COHORT] для пріоритету

## Section A — Cohort UC_HURT_WARZYWA_OWOCE no_match candidates (7 unique clients, 20 candidates)

| Client (cohort) | NIP | Client city | sim | rank | GMaps title | GMaps city | Category | Phone | Website |
|---|---|---|---|---|---|---|---|---|---|
| GRUPA MPT SPÓŁKA Z OGRANICZONĄ ODPOWIEDZ | 7641800258 | WARSZAWA | 1.00 | 1 | Grupa MPT Sp. z o.o. | Warszawa | Hurtownia produktów FMCG | - | http://www.grupampt.pl/ |
| "ARCTIC" SPÓŁKA Z OGRANICZONĄ ODPOWIEDZI | 6112171655 | RADZIEJOWICE | 1.00 | 1 | Arctic Sp. z o.o. | Radziejowice | Hurtownia owoców i warzyw | +48532129186 | http://www.arcticproduce.pl/ |
| "ARCTIC" SPÓŁKA Z OGRANICZONĄ ODPOWIEDZI | 6112171655 | RADZIEJOWICE | 1.00 | 2 | Arctic Sp. z o.o. | Drwalew | Magazyn | +48532129186 | http://arcticproduce.pl/ |
| PREMIUM TRADE SPÓŁKA Z OGRANICZONĄ ODPOW | 7972070629 | NOWA WIEŚ | 0.67 | 3 | I Oddział Premium Trade sp. z o. o. | Grójec | Urządzenia dla przemysłu  | +48697210250 | - |
| PREMIUM TRADE SPÓŁKA Z OGRANICZONĄ ODPOW | 7972070629 | NOWA WIEŚ | 0.50 | 1 | Premium Trade Sp. z o.o. Maszyny rolnicz |  |  | +48609160090 | - |
| PREMIUM TRADE SPÓŁKA Z OGRANICZONĄ ODPOW | 7972070629 | NOWA WIEŚ | 0.40 | 2 | II Oddział firmy Premium Trade Sp. z o.  | Kielce | Dostawca sprzętu rolnicze | +48885265265 | - |
| CONTINENTAL GROUP PL SPÓŁKA Z OGRANICZON | 7773358078 | POZNAŃ | 0.33 | 3 | Continental | Zambrów | Złomowanie samochodów | - | - |
| CONTINENTAL GROUP PL SPÓŁKA Z OGRANICZON | 7773358078 | POZNAŃ | 0.33 | 3 | Continental | Zambrów | Złomowanie samochodów | - | - |
| CONTINENTAL GROUP PL SPÓŁKA Z OGRANICZON | 7773358078 | POZNAŃ | 0.33 | 2 | Continental | Zambrów | Złomowanie samochodów | - | - |
| CONTINENTAL GROUP PL SPÓŁKA Z OGRANICZON | 7773358078 | POZNAŃ | 0.33 | 3 | Continental | Częstochowa | Złomowanie samochodów | - | - |
| GRUPA MPT SPÓŁKA Z OGRANICZONĄ ODPOWIEDZ | 7641800258 | WARSZAWA | 0.33 | 2 | MPT Poland Sp. z o.o. | Mielec | Producent | - | - |
| CONTRATAS POLONIA SPÓŁKA Z OGRANICZONĄ O | 5272480560 |  | 0.33 | 1 | Polonia Tatry Sp. Z O.o. |  |  | - | - |
| CONTRATAS POLONIA SPÓŁKA Z OGRANICZONĄ O | 5272480560 |  | 0.33 | 2 | Kotányi Polonia Sp. z o.o. | Warszawa | Hurtownia przypraw | +48225980180 | https://www.kotanyi.com/pl/ |
| CONTINENTAL GROUP PL SPÓŁKA Z OGRANICZON | 7773358078 | POZNAŃ | 0.20 | 1 | Continental Opony Polska Sp. z o.o. | Warszawa | Producent opon | +48225771300 | https://www.continental-tires.com/p |
| CONTINENTAL GROUP PL SPÓŁKA Z OGRANICZON | 7773358078 | POZNAŃ | 0.20 | 1 | Continental Opony Polska Sp. z o.o. | Warszawa | Producent opon | +48225771300 | https://www.continental-tires.com/p |
| CONTINENTAL GROUP PL SPÓŁKA Z OGRANICZON | 7773358078 | POZNAŃ | 0.20 | 1 | Continental Opony Polska Sp. z o.o. | Warszawa | Producent opon | +48225771300 | https://www.continental-tires.com/p |
| CONTRATAS POLONIA SPÓŁKA Z OGRANICZONĄ O | 5272480560 |  | 0.17 | 3 | Trans Polonia Group transport i spedycja | Tczew | Firma transportowa | +48585339015 | http://www.transpolonia.pl/ |
| CONTINENTAL GROUP PL SPÓŁKA Z OGRANICZON | 7773358078 | POZNAŃ | 0.12 | 2 | Continental Trade - Producent armatury p | Nadma | Producent | +48226190733 | https://www.continentaltrade.com.pl |
| CONTINENTAL GROUP PL SPÓŁKA Z OGRANICZON | 7773358078 | POZNAŃ | 0.12 | 2 | Continental Trade - Producent armatury p | Nadma | Producent | +48226190733 | https://www.continentaltrade.com.pl |
| GRUPA MPT SPÓŁKA Z OGRANICZONĄ ODPOWIEDZ | 7641800258 | WARSZAWA | 0.00 | 3 | Matthias - Hurtownia spożywcza | Gdańsk | Hurtownia spożywcza | +48583432928 | https://matthias.pl/ |

## Section B — Other no_match candidates (non-cohort, 1 unique clients) — lower priority

| Client | NIP | sim | GMaps title | GMaps city | Category | Phone |
|---|---|---|---|---|---|---|
| OLEUM DISTRIBUTION SPÓŁKA Z OG | 8393260847 | 1.00 | Oleum Distribution Sp. z o.o. | Starkowo | Hurtownia | +48505437282 |
| OLEUM DISTRIBUTION SPÓŁKA Z OG | 8393260847 | 0.50 | Oleum Sp. z o.o. | Cieszyn | Dostawca paliwa | +48338568321 |
| OLEUM DISTRIBUTION SPÓŁKA Z OG | 8393260847 | 0.00 | DYSTRYBUCJA PALIW Sp. z o.o. | Tczew | Dystrybutor paliwa | +48607985000 |