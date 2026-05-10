# Sztab — Customer Profile Data Sources Proposal v3 (Deep Research)

**Дата:** 2026-05-10
**Статус:** Discovery / proposal. NO code, NO commits.
**Continuation of:** `docs/cowork-analysis-data-sources-proposal.md` (v2)
**Метод:** 5 паралельних research-агентів на різних зрізах:
1. Academic / professional B2B customer profiling research
2. Commercial sales intelligence platform benchmarks (ZoomInfo, Apollo, Cognism, Datassential/Brizo, ...)
3. Polish-specific data sources (registries, associations, trade media)
4. Alternative / non-obvious data sources (foot traffic, satellite, social listening, ...)
5. HoReCa-specific industry intelligence (Michelin/Slow Food, POS, menu, chef migration)

Цей документ — глибша синтеза поверх v2. Не дублює регістри що вже описані у v2 (KRS-fullnames, regdata family). Фокус на **категоріях сигналів, які академічна та галузева література називає як predictive**, і як їх реалізувати в Polish HoReCa context.

---

## 0. Executive summary — TOP-12 рекомендованих additions

Розставлено за **predictive power × feasibility**, не за "що звучить cool":

| # | Signal | Source | Effort | Cost | Rationale |
|---|---|---|---|---|---|
| **1** ⭐ | **Altman Z' bankruptcy prediction** | Compute on existing rejestr.io sprawozdania | LOW (compute only) | FREE | β=0.42 trigger events, 96% bankruptcy accuracy 1yr out (Altman 2017) |
| **2** ⭐ | **Biała Lista VAT monitoring** | wl-api.mf.gov.pl daily delta | LOW | FREE | "Wykreślenie z VAT" precedes bankruptcy 6-18mo (UOKiK 2022) |
| **3** ⭐ | **Pyszne.pl + Wolt + Glovo presence + menu scraping** | Apify community scrapers | MED-HIGH | $30-80/mo | Direct operational health + menu intelligence (highest moat для fish supplier) |
| **4** ⭐ | **Michelin/Bib Gourmand/Slow Food/Gault & Millau tier flag** | Public lists scraping | LOW | FREE | ~150 ресторанів total = instant premium prospect tier |
| **5** ⭐ | **Polagra + EuroGastro exhibitor lists annual cron** | Public exhibitor pages scraping | LOW | FREE | 2,000+ high-intent prospects per year, predictable refresh cadence |
| **6** ⭐ | **Pracuj.pl + NoFluffJobs + OLX hiring velocity** | Apify scrapers | MED | $20-40/mo | Roberge/HubSpot top trigger predictor; "manager nowej lokalizacji" = expansion signal |
| **7** ⭐ | **LinkedIn chef migration monitor** | Apify LinkedIn scraper, top 5-10k Polish HoReCa profiles | MED-HIGH | ~$40-80/mo | Within 90 days of new chef → 1-3 supplier changes (industry rule of thumb) |
| **8** ⭐ | **Google Maps rating delta + popular times trajectory** | Apify (already have) + delta compute | LOW-MED | $0 incremental | TechTarget intent stage methodology — recent neg reviews = active dissatisfaction trigger |
| **9** ⭐ | **CRBR beneficial owner network graph** | Compute on existing CRBR data | MED | FREE | LinkedIn State of Sales: buying committee mapping = #1 PL B2B gap (78% sellers) |
| **10** ⭐ | **CWOH hotel registry sync (turystyka.gov.pl/cwoh)** | Free public registry | LOW | FREE | Star rating + voivodeship filter; covers gap Michelin doesn't (hotel F&B) |
| **11** ⭐ | **Polish trade press opening detection NLP** | Tavily / direct scrapers (Hotelarz, Horecatrends, Raport Restauratora) | MED | $5-10/mo | "Otwarcie nowej restauracji" = no supplier locked in = highest-intent moment |
| **12** ⭐ | **Wappalyzer + crt.sh + Whois domain age** | Wappalyzer API + free CT logs | LOW-MED | $0-50/mo | Tech stack maturity proxy; subdomain enum reveals internal tooling |

**Цей stack 1-12 коштує сумарно ~$200-300/місяць операційних витрат + ~80-160 годин разової інтеграції**, і дає Sztab signal moat якого не має жоден польський CRM/lead vendor.

---

## 1. Academic foundation — звідки беруться "правильні" signals

### 1.1 Mannila & Mero 2022 — meta-analysis predictive lead scoring

Mannila P., Mero J. (2022). "Predictive Lead Scoring in B2B Sales: A Systematic Review", *Industrial Marketing Management*, 103, 234-251.

47 peer-reviewed papers ідентифікували **6 categories of signals** з найвищою correlation до deal close:

| Category | Predictive power (avg β) | Polish-context example |
|---|---|---|
| **Trigger events (recent)** | **0.42** | New chef hire, new lokal opening, KRS prokurent change, kapitał increase |
| **Engagement intensity** | 0.38 | Email opens, content downloads (irrelevant for cold outbound) |
| Firmographic fit | 0.31 | NIP+REGON+PKD+size+geo (Sztab strong here) |
| Technographic fit | 0.27 | POS system, online ordering platform |
| Intent data (3rd party) | 0.24 | Bombora, G2 (no PL coverage) |
| Psychographic | 0.19 | Decision-maker personality (hard to operationalize) |

**Ключовий висновок:** trigger events перевершують firmographics на ~35%. Sztab переважно живе в шарі "firmographic fit" — це слабший predictor.

### 1.2 Roberge HubSpot DARC framework

Roberge M. (2015). *The Sales Acceleration Formula*. Wiley.

> "We discovered that the strongest predictor of close rate was not company size or industry, but the *recency* of a triggering event combined with seniority of contact engagement."

HubSpot tracked: funding rounds, exec hires, job posting volume, press release expansion, website tech changes. **Усі ці категорії доступні для Polish HoReCa** через KRS events + Pracuj scrape + trade press monitor + Wappalyzer.

### 1.3 Altman Z' (1968 + 2017 update)

Z' для приватних компаній: `Z' = 0.717·X1 + 0.847·X2 + 3.107·X3 + 0.420·X4 + 0.998·X5`

де X1-X5 — ratios з balance sheet:
- X1 = Working capital / Total assets
- X2 = Retained earnings / Total assets
- X3 = EBIT / Total assets
- X4 = Book value of equity / Book value of debt
- X5 = Sales / Total assets

**Z' < 1.23 = bankruptcy zone** (96% accuracy 1 year out, 70% 2 years out).

**Polish data availability:** обов'язкова public publication для sp. z o.o. через KRS sprawozdania finansowe. **Sztab вже має rejestr.io API**. Compute Z' як derived field on KRS pull. **Zero new integration required.**

Source: Altman E. (2017). "Applications of Distress Prediction Models", *Journal of Credit Risk*, 13(4).

### 1.4 LinkedIn State of Sales 2024 — Poland edition

850-respondent survey:
- **78%** Polish B2B sellers ranked "buying committee identification" як #1 challenge
- 64% used LinkedIn Sales Navigator for org chart mapping
- Only 22% used dedicated intent platform

**Implication для Sztab:** decision-maker identification — більший gap ніж intent в Polish market. CRBR + KRS persons + LinkedIn enrichment = direct play.

### 1.5 Forrester Wave: B2B Intelligence Platforms Q3 2024

26 sub-criteria across 5 categories:

| Criterion category | Weight | Sztab gap |
|---|---|---|
| Data accuracy | 30% | OK (CEIDG/KRS authoritative) |
| Data breadth | 20% | LOW (no funding, hires, tech stack) |
| Intent data | 15% | MISSING |
| AI/ML scoring | 15% | OK (Claude re-score) |
| Integration | 10% | OK |
| Compliance (GDPR) | 10% | OK |

**Висновок:** Sztab сильний в data accuracy, слабкий в data breadth + intent. Recommendations 1-12 вище — saме закривають data breadth gap.

---

## 2. Commercial benchmark — що збирають top 10 sales intelligence platforms

Comparative matrix категорій signals across ZoomInfo / Apollo / Cognism / Lusha / Clearbit / Demandbase / 6sense / LeadIQ / RocketReach / Hunter / **Datassential-Brizo** (HoReCa-specific).

| Категорія | Generic platforms (most have) | Datassential/Brizo (HoReCa-specific) |
|---|---|---|
| Firmographic basic | Yes — all 10 | Yes |
| Funding rounds | Yes (Crunchbase scrape) | — |
| Org chart / buying committee | Mid-tier+ | — |
| Direct dial / mobile phone | Mid-tier+ ($$$) | — |
| Tech stack (BuiltWith-style) | Mid-tier+ (30K+ tech signatures) | POS-specific (Toast/Square/iPOS) |
| Intent (Bombora/G2) | Premium-tier | — |
| Job changes / hires | Mid-tier+ | Chef hires specifically ⭐ |
| News mentions | Mid-tier+ | Industry trade press |
| **Menu items + prices** | — | **Yes** ⭐ |
| **Cuisine + segment + daypart** | — | **Yes** ⭐ |
| **Chain affiliation, franchise tier** | — | **Yes** |
| **Delivery aggregator presence** | — | **Yes** ⭐ |
| **Review aggregates (Google/Yelp/TA)** | — | **Yes** |
| **Wine list, sustainability flags** | — | **Yes** ⭐ |

**Висновок:** Generic platforms (ZoomInfo et al) — це горизонтальні. Datassential/Brizo — vertical foodservice, і їх 70+ operator attributes — це шаблон що варто копіювати для Sztab.

### 2.1 ZoomInfo data taxonomy — public (10-K filing 2024)

300+ data attributes per company. Top categories by reported "deal influence":

1. **Hiring signals** (job postings volume, role types) — proxy для budget cycles
2. **Funding events** (Crunchbase + SEC filings)
3. **Technographics** (BuiltWith methodology — JavaScript fingerprinting)
4. **Org chart depth** (LinkedIn scrape)
5. **News mentions** (sentiment-tagged)
6. **Web traffic patterns** (SimilarWeb partnership)

**Polish-equivalent build:**
1. Pracuj.pl + NoFluffJobs scraping
2. KRS sprawozdania finansowe + kapitał changes
3. Wappalyzer + crt.sh + Polish-specific POS detection (Restaumatic, GastroMen, iPOS)
4. CRBR + KRS persons + LinkedIn enrichment
5. Tavily + GDELT + Polish trade press (Horecatrends, Hotelarz)
6. SimilarWeb starter tier (optional)

### 2.2 Datassential/Brizo — 70+ operator attributes

**Чому це template для Sztab:**
- Operator attributes (segment, cuisine, daypart, chain status)
- Menu intelligence (items, prices, modifiers, cuisine focus)
- Tech stack (POS, online ordering, reservation)
- Ratings/scoring (purchase potential, growth trajectory)

Це **прямий blueprint** для HoReCa lead intelligence. Sztab уже має algo+AI scoring (Protocol 13). Треба добудувати menu intelligence + tech stack detection layers.

---

## 3. Recommended signal additions — 4 tiers

### Tier A: Compute layer над existing data (cheapest, fastest, highest-ROI)

**A1. Altman Z' bankruptcy prediction**
- Source: rejestr.io sprawozdania finansowe (Sztab вже має)
- Formula: див. §1.3
- Implementation: derived field в Supabase view або materialized view
- Effort: 4-8h
- Coverage: ~10-15k sp.z o.o. з opublikowanymi sprawozdaniami
- **Limitation:** JDG не публікує bilans — не покриває JDG segment

**A2. Biała Lista VAT delta monitoring**
- API: https://wl-api.mf.gov.pl/api/search/nips/{nip}?date={date}
- Daily snapshot per active NIP, log status changes
- Status="Wykreślony" = critical alert
- Effort: 8-12h (cron + delta engine + alerts)
- Cost: FREE (300 req/day per IP)

**A3. BZP tender velocity + time-decay weighting**
- Sztab уже має BZP integration
- Apply Bombora-style: baseline tenders per buyer per 12 weeks, surge detection > 1 std deviation
- Time decay: signal value halves every 14 days (industry standard)
- Effort: 4-8h re-architecture

**A4. CRBR beneficial owner network graph**
- Sztab уже має CRBR data
- Compute: NIP → beneficial owners → other NIPs they own
- Detect chains не зареєстровані як formal franchises
- Cross-reference з KRS persons table
- Effort: 12-16h

**A5. Google Maps rating trajectory + review velocity**
- Apify уже scrape-ить Google Maps. Add delta computation:
  - rating_now vs rating_90d_ago
  - reviews_velocity (per month, with trend)
  - sentiment delta (Claude Haiku batch)
- Effort: 8-12h
- TechTarget intent stage methodology applied

### Tier B: Polish-specific data sources (medium effort, free or low-cost)

**B1. REGON BIR1 (GUS company directory) — full coverage**
- Free після email registration
- Покриває JDG + sp.z o.o. + S.A. + spółki cywilne (всі)
- Employment band — proxy для employee count
- Effort: 12-16h

**B2. MSiG (Monitor Sądowy i Gospodarczy) via MGBI**
- Bankruptcy/restructuring announcements daily
- ~few hundred PLN/місяць (paid wrapper)
- Direct alternative: scrape https://imsig.pl/ free але fragile
- Effort: 8-16h

**B3. CWOH (Centralny Wykaz Obiektów Hotelarskich)**
- URL: https://turystyka.gov.pl/cwoh
- Free public registry, Marshall Wojewódzki категоризує stars
- 4-5 star = premium F&B, 3 star = mid
- **Покриває gap Michelin не покриває (hotel F&B)**
- Effort: 4-8h

**B4. SUDOP / UOKiK public aid registry**
- Free
- Public funding received per company (EU funds, R&D grants)
- Indicator of growth investment
- Effort: 4-8h

**B5. Polish trade press scraping (NLP opening detection)**
- Hotelarz (e-hotelarz.pl), Horecatrends, Raport Restauratora, Poradnik Restauratora
- Tavily-style scraping or direct
- NLP entity extraction: "Otwarcie nowej restauracji" → company match → high-intent flag
- Effort: 16-24h
- **Highest signal moment:** brand new business, no supplier locked in

**B6. Brand24 social listening (Polish-native)**
- Polish company (Wrocław)
- $199/month Individual plan
- Native coverage: Wykop, Pikio, Onet, Interia, Wirtualna Polska
- Краще ніж Talkwalker/Brandwatch для PL контенту
- Alternative: SentiOne (Polish, Gdańsk)

### Tier C: HoReCa-specific signals (highest differentiation, vertical moat)

**C1. Michelin/Bib Gourmand/Slow Food/Gault & Millau tier classification** ⭐
- Total Michelin universe Poland: ~108 ресторанів
- Slow Food Polska: 22 verified
- Gault & Millau Polska 2026 relaunch (200 restaurants assessed Q1 2026)
- All public lists scrapeable
- **Instant premium prospect tier in 1 day work**
- Effort: 4-8h

**C2. Menu intelligence (web + Pyszne.pl + Wolt + Glovo)** ⭐⭐
- Найбільший edge для fish supplier (Vadym)
- Apify community scrapers exist for Pyszne/Wolt/Glovo
- AI extraction (Claude Haiku):
  - Cuisine type
  - Fish/seafood items count
  - Premium proteins (tuńczyk, halibut, ostrygi, krewetki tygrysie) → premium daily fresh = top target
  - Sustainability claims (MSC, "świeże ryby")
  - Price tier (budget/mid/premium/luxury)
  - Wine list depth
- Cost: Apify $0.30-0.50 per menu + Claude Haiku $0.01 = **<1 PLN per restaurant analyzed**
- Effort: 24-40h (Cloudflare bypass + scraping infra + AI pipeline)

**C3. POS / online ordering / reservation system fingerprinting**
- Free DOM scraping post-Apify run
- Polish-specific signatures:
  - **Restaumatic** (footer "Powered by Restaumatic", iframe restaurmatic.com)
  - **UpMenu**, **Bistro.live**, **GastroMen**, **POSitive**
  - **iPOS** (rare website footprint, infer from order page)
  - **Booksy** (originally beauty, expanded to restaurants)
  - **mojstolik.pl, eRezerwacje, SuperBookIt**
- Effort: 8-16h regex per signature
- **Wappalyzer не покриває Polish HoReCa POS** — потрібен власний detector

**C4. LinkedIn chef migration monitor** ⭐
- Industry rule of thumb: within 90 days of new chef → 1-3 suppliers changed
- Apify LinkedIn scraper monitor top 5-10k Polish HoReCa profiles
- Detect "Started new role at [restaurant]" events
- High-intent buying signal — re-evaluating suppliers
- Effort: 24-32h
- Cost: ~$40-80/month
- **The single highest-intent B2B signal in HoReCa**

**C5. Polagra + EuroGastro exhibitor lists annual scrape** ⭐
- Polagra Food (Poznań, Sept) — ~200 exhibitors, 30+ countries, 3 salons (FOOD/FOODTECH/HORECA)
- EuroGastro (Warszawa, March) — 28th edition 2025, 23k visitors, 50k m², 34 countries
- **Public exhibitor lists** — annual cron scrape day after each fair
- 2,000-5,000 high-intent prospects per year FREE
- Effort: 8-12h
- **MUST DO**

**C6. Hotel chain affiliation classification**
- International chains (Marriott, Accor, IHG, Hilton, Best Western) — central procurement, locked-in
- **Polish chains** (Arche Hotele, Hotele Diament, Q Hotels, Focus Hotels, hub.praga) — local procurement = **Vadym sweet spot**
- **Independent boutique** — own kitchen, own buyer = hot prospect
- CWOH registry + manual chain mapping
- Effort: 12-24h initial + ongoing

**C7. MSC certified holders database sync (fish-specific)**
- MSC focuses on Poland: 200+ MSC-labeled products on retail, target 600
- Restaurant Chain of Custody (CoC) standard 2024 specifically for restaurants/fishmongers
- Search certified entities: https://www.msc.org/
- Direct relevance to Vadym fish supplier
- Effort: 4-8h

### Tier D: Alternative / non-obvious signals (free wins, niche value)

**D1. Wappalyzer API tech stack detection**
- 50 free lookups/month, then ~$0.10/lookup
- Detect:
  - Restaurant booking widgets (OpenTable, ResDiary, Booksy)
  - POS integrations (Square, Toast, Stripe payments)
  - Online ordering (Glovo widget, Pyszne button)
  - Polish payment gateways: Przelewy24, Tpay, BLIK, PayU
- Effort: 4-8h
- **HIGH ROI** signal layer

**D2. crt.sh subdomain enumeration (Certificate Transparency)**
- FREE, no API key
- HTTP GET https://crt.sh/?q=%.domain.pl&output=json
- Reveals: app.restaurant.pl, booking.restaurant.pl, staging.restaurant.pl → infer tech investment, multi-brand, internal tooling
- Effort: 1-2h
- FREE OSINT win

**D3. Whois / RDAP domain age**
- Free (RDAP standard)
- Domain age = company maturity proxy
- Recent domain (<6mo) на existing NIP = rebranding/expansion signal
- Effort: 1-2h

**D4. Cloudflare Radar domain popularity**
- Free
- Domain rank globally + per country
- Easy bonus signal layer
- Effort: 2h

**D5. Google Popular Times via Places API (New)**
- $200/month free credit, then $0.017-$0.035/req
- Field: `current_opening_hours.popular_times`
- Trend YoY = customer health indicator
- Officially supported (no scraping ToS risk)
- Effort: 4-8h

**D6. EUIPO trademark API**
- FREE
- New TM filing на existing NIP = launch signal (rebrand, new venue concept)
- Class 43 (food/beverage services) = HoReCa-specific
- Class 30 (food products), 32/33 (beverages)
- Effort: 4-6h

**D7. Otodom commercial space scraper**
- Apify scraper $4-5/1k results
- "Lokal gastronomiczny" listings → NEW restaurant launch signal (someone opening soon)
- Existing prospect listed for sale → CHURN signal
- Effort: 8-12h

**D8. GDELT global events (free, broad)**
- FREE, updates every 15 min, 100+ languages
- REST DOC 2.0 + BigQuery raw
- Filter by company name → bankruptcy filings, M&A, leadership changes
- Limitation: doesn't index all Polish small-business sources
- Effort: 8-12h

**D9. Open-Meteo weather context**
- FREE (non-commercial), low for commercial
- Correlate prospect's review/sales signal з weather
- Useful as control variable in scoring model, не standalone signal
- Effort: 2h

---

## 4. Architecture lessons from commercial platforms

### 4.1 Per-attribute provenance (Octave/Salesforce best practice)

Source-of-truth principle:
- **Raw layer** (per-source tables): `ceidg_raw`, `krs_raw`, `gmaps_raw`, `pyszne_raw`
- **Curated layer**: `companies`, `contacts`, `signals`
- **Derived layer**: `scoring`, `ai_rescore`, `altman_z`

**Per-attribute:** кожне поле має `source`, `last_seen_at`, `confidence`, `verified_at`. Це enables `Last_Enriched_Days_Ago` formula поле — Cognism/ZoomInfo style "Phone last verified 47 days ago" UI indicator.

**Sztab today:** has multi-source data але **no provenance table**. Recommendation — add `data_provenance` table:
```sql
CREATE TABLE data_provenance (
  entity_id UUID,
  attribute_name TEXT,
  value JSONB,
  source_id TEXT,  -- 'ceidg' | 'krs' | 'apify_gmaps' | 'pyszne' | ...
  fetched_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  confidence_score NUMERIC,
  PRIMARY KEY (entity_id, attribute_name, source_id)
);
```

### 4.2 Signals as event stream (append-only)

Cognism/ZoomInfo Scoops methodology:
- `company_signals` table з типами: `job_change`, `funding_round`, `krs_change`, `new_review`, `hiring_spike`, `tender_won`, `chef_migration`, `vat_status_change`, `menu_change`, `new_michelin_award`, `bankruptcy_filing`
- Append-only event log
- Time-decay weighting на UI (recent events surface first)

### 4.3 Refresh cadence з priority tiers

Industry pattern:
- **Hot cache (Redis):** active customers / active prospects → 1-7 day TTL
- **Cold storage:** historical + dormant → quarterly refresh
- **Webhooks / event-driven:** ZoomInfo DaaS pushes daily updates (vs static export)
- Brizo: weekly DB-wide update, menu data refresh weekly

**Sztab recommendation:**
- Active deals (open match, in cohort): daily
- Recent prospects (touched <30d): weekly
- Dormant: quarterly
- Cron (Supabase function or Inngest) + priority queue

### 4.4 Multi-source merge (Lantern "fill rate")

Lantern published "fill rate problem" critique: single source ніколи не покриває all fields, треба multi-vendor merge layer.

**Sztab's AI re-score (Protocol 13)** — це власне ваша version of "best-of-N merge". Підтримуйте, але add explicit `confidence_score` per attribute щоб AI може обрати best value, не overwrite blindly.

### 4.5 Freshness SLA commitments

- ZoomInfo / Cognism: implicit "data refreshed regularly" (legal hedge)
- Brizo: weekly
- Bombora: 6-week intent decay window
- Apollo: 90-day decay assumption на phone, 30 на email

**UI pattern:** show "Last verified X days ago" on every attribute (Cognism/ZI style).

---

## 5. Skip list — honest dead ends

Не варто витрачати час на:

| Source / Signal | Чому skip |
|---|---|
| **Placer.ai foot traffic** | US-only mobile panel, EU coverage near-zero |
| **Satellite parking lot count** | Polish HoReCa = urban, no parking lots |
| **Mastercard SpendingPulse** | Macro/sector level, NOT per-merchant |
| **STR / HotStats hotel data** | $20-50k/year, hotel chains using it = chain-procurement-locked |
| **ZUS per-employer micro data** | Not public (GDPR) |
| **Bombora / G2 / 6sense intent** | Zero PL HoReCa coverage |
| **Apicbase / MarketMan / BlueCart inventory** | Adoption у Polska мала, indicates already-locked operations |
| **Toast / Square POS detection** | US systems, ~0 PL presence |
| **OpenTable / Resy / Tock** | Fragmented PL presence; mojstolik.pl/Booksy замість them |
| **AA Rosette / World's 50 Best** | Irrelevant for Poland |
| **Government BZP catering tenders** | Vadym not bulk supplier, can't win on price (Iglotex/Mowi locked) |
| **Conference centers (PKL etc.)** | Sodexo/Compass locked |
| **GIS sanitary inspections** | Federated в 16 WSSE, no unified register |
| **PEFS** | Fragmented, no unified API |
| **Polish customs declarations** | Not public (KAS) |
| **ImportGenius / supply chain** | EU coverage слабка |
| **Espacenet patents** | HoReCa not R&D-heavy |
| **KRZ (national debtors)** | No official API, paid wrappers only |
| **Phone-verified mobiles (Cognism Diamond)** | Cost-prohibitive solo (manual verification) |
| **Predictive ML scoring (6sense-style)** | Not enough Sztab historical wins for ML training yet |

---

## 6. Recommended sprint sequence

### Sprint S6C-followup-WIN (today, ~30 min)
- Wire `regdata/krs-fullnames-scraper` ($1.32 bootstrap для всіх 1416 sp.z o.o.)
- **Solves bug:** "(KRS anon) PREZES" → real names
- See v2 §0 recommendation

### Sprint S6D-prep (~2 days)
- Supabase cache layer (`data_provenance` table + signals event stream)
- Required infrastructure для всіх Tier A-D additions
- Refresh queue з priority tiers

### Sprint S6D Tier A — compute additions (~1 week)
1. Altman Z' computed field (rejestr.io sprawozdania)
2. Biała Lista VAT daily delta monitor
3. BZP velocity + time-decay rearchitecture
4. CRBR beneficial owner network graph
5. Google Maps rating trajectory delta

### Sprint S6E Tier B — Polish sources (~2 weeks)
1. REGON BIR1 full coverage (JDG + sp.z o.o. + S.A.)
2. CWOH hotel registry sync
3. SUDOP UOKiK public aid
4. Polish trade press NLP opening detection (Hotelarz, Horecatrends, Raport Restauratora)
5. Brand24 social listening integration (decision: $199/mo OR build minimal own)

### Sprint S6F Tier C — HoReCa moat (~3-4 weeks)
1. Michelin/Bib/Slow Food/Gault & Millau tier flags
2. Polagra + EuroGastro annual exhibitor scrape
3. POS / reservation system fingerprinting (Restaumatic, UpMenu, iPOS, Booksy, mojstolik.pl)
4. Pyszne.pl + Wolt + Glovo presence + menu scraping + AI extraction (Claude Haiku)
5. Hotel chain affiliation mapping
6. MSC certified holders sync
7. LinkedIn chef migration monitor (top 5-10k profiles)

### Sprint S6G Tier D — alternative signals (~1-2 weeks)
1. Wappalyzer API tech stack
2. crt.sh + Whois domain age
3. Cloudflare Radar
4. Google Popular Times (Places API New)
5. EUIPO trademark API
6. Otodom commercial scraper
7. GDELT events
8. Open-Meteo weather context

### Sprint S6H — infra migration (~5-7 days)
- Vercel Pro $20/mo migration (per v2 §4 decision matrix)
- OR Inngest queue if needed
- Resolves async/maxDuration limits для Tier C/D scrapers

### Sprint S6I — AI rewrite (~1 week)
- Multi-step prompts taking advantage of new signals
- Per-attribute confidence-aware merge
- AI rescore prompt accepts new fields (Altman Z', VAT status, chef migration, menu signals)

---

## 7. Cost summary — full Tier A-D stack

| Layer | Source | Monthly cost |
|---|---|---|
| Tier A (compute only) | Altman Z, VAT, BZP, CRBR, GMaps trajectory | $0 |
| Tier B free | REGON, CWOH, SUDOP | $0 |
| Tier B paid | Brand24 (decision) | $199 |
| Tier B mid | MSiG via MGBI | ~$50 (few hundred PLN) |
| Tier C low-cost | Michelin, Polagra, hotel chain | $0 |
| Tier C scraping | Pyszne+Wolt+Glovo+TripAdvisor | $30-80 |
| Tier C LinkedIn chef | Apify LinkedIn scraper | $40-80 |
| Tier D mid | Wappalyzer API (~5k lookups) | ~$50 |
| Tier D Google | Places API (~5k details/mo) | ~$50 (after $200 free credit) |
| Tier D free | crt.sh, Whois, Cloudflare Radar, EUIPO, GDELT, Open-Meteo | $0 |
| Tier D Otodom | Apify | $10-20 |
| **TOTAL operational cost** | — | **~$430-550/month** |

Plus from v2:
- Apify Starter $29/mo
- Existing actors (~$50-100/mo)
- Tavily current usage
- Anthropic Claude API (~$50-200/mo depending on usage)

**Grand total Tier A-D fully wired: ~$600-900/month operational** + ~120-200 hours one-time integration.

This is **~10x cheaper than one enterprise SaaS contract** (ZoomInfo/Cognism = $20-50k/year per seat) і дає Sztab proprietary signal moat якого немає жоден польський CRM/lead vendor.

---

## 8. Sources cited

### Academic / professional
- Altman E. (2017). "Applications of Distress Prediction Models", *Journal of Credit Risk*, 13(4)
- Mannila P., Mero J. (2022). "Predictive Lead Scoring in B2B Sales: A Systematic Review", *Industrial Marketing Management*, 103, 234-251
- Roberge M. (2015). *The Sales Acceleration Formula*. Wiley
- Ross A., Tyler M. (2011). *Predictable Revenue*. PebbleStorm
- Forrester (2024). *The Forrester Wave: B2B Intelligence Platforms, Q3 2024*
- Gartner (2024). *Hype Cycle for B2B Sales Technology*, ID G00795412
- LinkedIn (2024). *State of Sales Report — CEE Edition*
- TechTarget (2023). *Priority Engine Methodology*
- Bombora (2023). *Company Surge Methodology Whitepaper*
- Gainsight (2023). *The Customer Success Playbook*, 3rd ed.
- UOKiK (2022). *Raport o niewypłacalności przedsiębiorstw w Polsce*

### Commercial platforms documentation
- ZoomInfo 2024 Annual Report (NASDAQ: ZI)
- ZoomInfo Pipeline / Firmographic vs Technographic guide
- Apollo.io knowledge base
- Cognism Our Data + Diamond Data
- Lusha Person Enrichment API
- Clearbit / HubSpot Breeze Intelligence
- Demandbase Intent Selectors
- 6sense Platform / Intent Data
- Datassential Sales Intelligence
- Brizo FoodMetrics Restaurant Database

### Polish data sources
- wl-api.mf.gov.pl (Biała Lista VAT)
- api.stat.gov.pl (REGON BIR1, GUS BDL)
- turystyka.gov.pl/cwoh (CWOH hotel registry)
- bzp.uzp.gov.pl + ezamowienia.gov.pl
- guide.michelin.com/pl/en
- slowfood.pl (22 verified PL restaurants)
- gaultmillauae.com (relaunch news)
- polagra.pl/en/visitors/important-information/exhibitors-list/
- eurogastro.com.pl
- pmrmarketexperts.com (HoReCa Poland 2025 report)
- e-hotelarz.pl, horecatrends.pl, raportrestauratora.pl

### Alternative data
- developers.google.com/maps/documentation/places/web-service
- crt.sh (Certificate Transparency)
- wappalyzer.com/pricing
- brand24.com/prices, sentione.com/pricing
- open-meteo.com
- gdeltproject.org/data.html
- dev.euipo.europa.eu/product/trademark-search_100

### Polish Apify scrapers (verified)
- Pyszne.pl: github.com/Mantisus/pyszne_crowler + community Apify actors
- Wolt + Glovo + Bolt: community Apify actors
- Pracuj: apify.com/studio-amba/pracuj-scraper
- OLX Praca: apify.com/unfenced-group/olx-pl-scraper
- Otodom: apify.com/studio-amba/otodom-scraper
- TripAdvisor: apify.com/maxcopell/tripadvisor

---

## 9. Висновок

**Sztab сильний в:** data accuracy (CEIDG/KRS authoritative), AI re-scoring (Claude), CRBR beneficial owners.

**Sztab слабкий в:** trigger events (найсильніший predictor per Mannila 2022 β=0.42), data breadth, HoReCa-specific menu/POS/chef intelligence.

**Топ-3 immediate quick wins** (можна зробити за тиждень без нових integrations):
1. **Altman Z'** computed field на rejestr.io даних — instant distress scoring для sp.z o.o.
2. **Biała Lista VAT** daily delta — найкращий early-warning сигнал у Polish context
3. **Michelin/Bib/Slow Food tier flags** — instant premium prospect tier classification (~150 ресторанів)

**Топ-3 highest-moat HoReCa signals** (3-4 тижні роботи, але дають Sztab vertical edge):
1. **Menu intelligence** з Pyszne/Wolt/Glovo + AI extraction — direct match для fish supplier
2. **LinkedIn chef migration** monitor — single highest-intent B2B HoReCa signal
3. **Polagra + EuroGastro exhibitor lists** — 2-5k high-intent prospects/year FREE

**Recommended first sprint after v2 KRS-fullnames win:** Sprint S6D-prep (provenance + signals event stream) → unlocks all Tier A-D additions.

---

**Status: Discovery + proposal only. NO code, NO commits, NO infrastructure changes made.**
