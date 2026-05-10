# Sztab Phase B Analysis Data Sources — Proposal v2

**Date:** 2026-05-11 (revised after Vadym verified мої claims через web research)
**Type:** Discovery + critique з brutal honesty
**Goal:** Audit 27-source proposal Vadyma з verified Polish-specific Apify actors

**v2 changelog vs v1:**
- 🔴 Fixed cost error: Apify Starter **$29/mo** (не $49 як я писав)
- 🔴 Fixed cost error: regdata/poland-krs-financial-scraper **$0.005/firm** (не $0.03 як я писав)
- 🟢 Додано **9 verified Polish-specific Apify actors** з regdata + parseforge + alwaysprimedev families
- 🟢 Додано **Section 10 — Custom actor build/buy decision framework**
- 🟢 Vercel Pro $20/mo option додано як alternative to Inngest
- 🟡 BUT новий ⚠️ red flag: regdata/poland-krs-financial-scraper has "Under maintenance" badge + Incapsula WAF requires residential proxy ($30-100/mo) — **real cost не $0.005/firm**

---

## Executive summary v2

After Vadym's web verification, my v1 audit had 2 cost errors і missed entire family of Polish-specific Apify actors. **Revised situation more favorable but з 2 new red flags:**

**Good news:**
1. **regdata maintainer family** has 9+ verified Polish gov registry scrapers (KRS, KRZ, KNF, CRBR, MSiG, BDO, UOKiK) at $0.0015-0.005/result. Most are 2-7 days old (very fresh, active dev). 2 of these (KRS-fullnames + MSiG) directly resolve gaps Vadym має зараз.
2. **GUS BDL** has FREE official REST API на bdl.stat.gov.pl/api/v1/ — eliminates need для scraping local economic data
3. **Polagra Food + EuroGastro** exhibitor catalogs publicly scrape-able (~200-500 entries/fair, annual) — high-quality intent signal для HoReCa
4. **OSM Overpass + Wikidata SPARQL** = free, programmatic, well-documented

**Red flags discovered:**
1. ⚠️ **regdata/poland-krs-financial-scraper** has "Under maintenance" badge + Incapsula WAF requires PL residential proxy ($30-100/month) — real cost NOT $0.005/firm
2. ⚠️ **regdata maintainer = startup** (joined Nov 2025, low actor popularity 2-39 users). Sustainability risk if popular actors get C&D'd by gov portals.
3. ⚠️ **Aleo actors** (Bisnode-owned platform): ToS prohibits scraping, low Apify popularity (2-7 users) = high deprecation risk
4. ⚠️ **Vercel Pro maxDuration = 60s default** (NOT 300s). Fluid Compute 800s ceiling separate. Vercel Pro alone не вирішує SOLERA 244s wall-clock — потрібен Inngest або redesign.

**Realistic monthly external API budget (revised):**
- Initial Tier 1: **$30-50/mo** (Tavily Project $30 + Apify Free overage $5-15 + Inngest free)
- Scaled Tier 1+2: **$60-90/mo** (з Apify Starter $29 + Tavily Project $30 + small per-call overhead)
- v1 estimate $80-160/mo was 1.5-2× over realistic — Vadym був правий

**Recommended path (revised):**
- ⭐ **Sprint S6C-followup-IMMEDIATE (~30 min):** Wire `regdata/krs-fullnames-scraper` — solves anonymous "(KRS anon) PREZES" bug TODAY. 30 min effort, $1.32 для 264 firms, zero risk. **Vadym demand'ить immediate visible win — це він.**
- **Sprint S6C-2 (parallel):** Tavily query rewrite multi-pass (resolves SOLERA hallucination)
- **Sprint S6D-prep (~2 days):** Cache layer Supabase table — STILL precondition. Без нього Tier 2/3 economics broken.
- **Sprint S6D Tier 1 (revised, ~1.5-2 weeks):** WWW direct + rejestrio person-network + Apify Panorama + Apify ALEO (з ToS caveat) + GUS BDL API + CEIDG official API expansion
- **Sprint S6E Tier 2:** Apify MSiG + Apify KRZ + Apify KNF + Wikidata + Polagra/EuroGastro fair scrapers (custom)
- **Sprint S6G runtime migration:** Vercel Pro $20/mo enough якщо Phase B refactored to ≤60s sync chunks. Інакше Inngest free.

---

## 1. Existing code map — REVISED з 9 verified Polish Apify actors

| # | Source | lib/* path | Status | Wiring effort |
|---|---|---|---|---|
| **CURRENT 9 (unchanged from v1)** ||||||
| 1-9 | GUS, KRS public, VAT, rejestrio rozdzial, CRBR, BZP, Tavily, Apify GMaps, AI Business | various | ✅ Wired | n/a |
| **NEW Polish-specific Apify actors (verified 2026-05-11)** ||||||
| **N1** | **regdata/krs-fullnames-scraper** ⭐ TOP | `lib/enrichment/apify.ts` reuse pattern | ❌ Greenfield wrap | **~30 min** ⭐ — solves anonymous PREZES bug |
| N2 | regdata/krz-debtor-scraper | same wrap | ❌ Greenfield | ~1 day |
| N3 | regdata/knf-registry-scraper | same wrap | ❌ Greenfield | ~1 day |
| N4 | regdata/crbr-beneficial-owners-scraper | same wrap | ❌ Greenfield (alt to existing rejestrio CRBR) | ~1 day |
| N5 | regdata/poland-krs-financial-scraper | same wrap | ⚠️ "Under maintenance" badge + Incapsula WAF | ~1 day wire BUT real cost $30-100/mo residential proxy додатково |
| N6 | regdata/msig-scraper | same wrap | ❌ Greenfield | ~1 day |
| N7 | regdata/bdo-waste-registry-scraper | same wrap | ❌ Greenfield (low priority — waste registry rarely actionable for HoReCa) | ~1 day |
| N8 | regdata/uokik-clauses-scraper | same wrap | ❌ Greenfield (low priority) | ~1 day |
| N9 | parseforge/krs-poland-scraper | same wrap | ❌ Greenfield (alternative basic KRS) | ~1 day |
| N10 | alwaysprimedev/panoramafirm-scraper | same wrap | ❌ Greenfield | ~1 day |
| N11 | trev0n/regon-scraper | same wrap | ❌ Greenfield (alternative to GUS) — НЕ wire (existing GUS works) | n/a |

### Code map summary v2

- **9/27 sources вже wired** (current Phase B unchanged)
- **6/27 partial code exists, не wired** (lib/enrichment/website.ts, lib/allegro/, lib/rejestrio/person-network.ts, lib/enrichment/msig.ts, sprawozdania, krs-financials)
- **+9 new Polish Apify actors verified** (regdata/* + parseforge/* + alwaysprimedev/*) — all greenfield wrap але reuse existing `lib/enrichment/apify.ts` pattern (~30 min - 1 day each)
- **12/27 sources greenfield** (need full build — anti-bot websites, custom scrapers, etc.)

### Revised Tier 1 (replaces v1 ordering per Vadym proposal)

| # | Source | Effort | Cost (264 firms) | Value |
|---|---|---|---|---|
| **0** ⭐ | **regdata/krs-fullnames-scraper** | **30 min** | **$1.32** (one-time bootstrap) | **Solves anonymous PREZES NOW** — immediate user-visible win |
| 1 | Cache layer Supabase table | 2 days | $0 | Foundation для Tier 2/3 economics |
| 2 | Tavily query rewrite multi-pass + .pl filter | half day | covered $30/mo | Solves SOLERA hallucination |
| 3 | WWW direct fetch з anti-bot fallback | 2-3 days | $0 (proxy on overflow) | High data density |
| 4 | rejestrio person-network wire | 1-2 days | marginal | Network analysis, UA detection |
| 5 | alwaysprimedev/panoramafirm-scraper | 1 day | $1.32 ($0.005×264) | Phone E.164 + email + NIP + geo + reviews single source |
| 6 | regdata/poland-krs-financial-scraper ⚠️ | 1 day wire | $1.32 + **$30-100/mo residential proxy** | Sprawozdania finansowe ALE proxy cost rzeczywisty |
| 7 | Apify ALEO scraper (delectable_incubator) | 2 days з ToS caveat | $1.30 ($0.0049×264) | B2B network deep — risky |

### Revised Tier 2

| # | Source | Effort | Cost (264 firms) | Value |
|---|---|---|---|---|
| 8 | regdata/msig-scraper | 1 day | $0.66 ($0.0025×264) | Replaces stale lib/enrichment/msig.ts |
| 9 | regdata/krz-debtor-scraper | 1 day | $0.79 ($0.003×264) | Bankruptcy/restructuring early warning |
| 10 | regdata/knf-registry-scraper | 1 day | $0.66 | KNF financial regulation flag |
| 11 | regdata/crbr-beneficial-owners-scraper | 1 day | $1.32 | CRBR alt — backup для existing rejestrio |
| 12 | GUS BDL official API (free) | 1-2 days | $0 | Local economic indicators per powiat |
| 13 | Wikidata SPARQL queries | 1 day | $0 | Chains coverage (Żabka, Lewiatan etc.) |
| 14 | OSM Overpass API | 1 day | $0 | Free GMaps alternative для restaurants mapping |
| 15 | dane.gov.pl REST API | 1 day | $0 | EU funds + agricultural subsidies aggregator |
| 16 | beneficjenciwpr.minrol.gov.pl official API | 1-2 days з API token | $0 (free with registration) | CAP agricultural beneficiaries |
| 17 | Polagra Food + EuroGastro fair scraper (custom HTML) | 2-3 days | $0 | Annual exhibitor lists — gold for HoReCa intent signal |

### Revised Tier 3 (low priority / on-demand)

- Allegro Business для clients (low ROI ~5-15% HoReCa B2B на Allegro)
- WHOIS/DNS (weak actionable signal)
- Wayback Machine (marginal)
- regdata/bdo-waste-registry-scraper (rarely actionable for HoReCa)
- regdata/uokik-clauses-scraper (rarely actionable)
- TripAdvisor (only для gastronomy clients, ~30% of HoReCa pool)
- LinkedIn/Instagram/Facebook scraping (ToS + GDPR risk)
- Pyszne.pl/Glovo/Wolt (no Apify actors, ToS prohibits)
- OpenCorporates paid (£2,250/year not justified)

---

## 2. Cost reality check — REVISED

**Verified pricing (агент verified 2026-05-11 через apify.com fetch + docs):**

| Source | Per-call cost | Free tier | 264 firms × 1/month | Verdict |
|---|---|---|---|---|
| **Apify Starter** | base $29/mo (was wrong $49 у v1) | Free $5 platform credit | covers most pay-per-event | **Need $29/mo** for production reliability |
| Tavily Project | $0.008/credit | 1k cr/mo | ~1,320 cr (multi-pass) | $30/mo |
| Apify Google Maps (compass/crawler) | $0.002/place + $0.25/1000 reviews | within Starter | ~$0.50-1.50/firm | within $29 base |
| **regdata/krs-fullnames-scraper** | **$0.005/firm** + $0.005 start | within Starter | $1.32/mo bootstrap | **TOP PRIORITY — cheap immediate value** |
| **regdata/poland-krs-financial-scraper** | **$0.005/firm** (was wrong $0.03 у v1) BUT requires PL residential proxy | within Starter | $1.32 + **$30-100/mo proxy** | Real cost NOT $0.005 |
| regdata/msig-scraper | $0.0025/firm | within Starter | $0.66/mo | Cheap |
| regdata/krz-debtor-scraper | $0.003/firm + $0.025 start | within Starter | $0.79/mo | Cheap, requires JWT session |
| regdata/knf-registry-scraper | $0.0025/firm + $0.005 start | within Starter | $0.66/mo | Cheap |
| regdata/crbr-beneficial-owners-scraper | $0.005/firm + $0.025 start | within Starter | $1.32/mo | MEDIUM ToS — Incapsula WAF |
| parseforge/krs-poland-scraper | $0.006/firm | within Starter | $1.58/mo | Alternative baseline |
| alwaysprimedev/panoramafirm-scraper | $0.005/firm | within Starter | $1.32/mo | Phone+email+NIP+geo+reviews |
| trev0n/regon-scraper | $0.01/firm | within Starter | $2.64/mo | НЕ wire (GUS works) |
| Apify ALEO (delectable_incubator) | $0.0049/firm | within Starter | $1.30/mo | ⚠️ MEDIUM ToS risk |
| **GUS BDL official API** | $0 free | unlimited (з X-ClientId optional) | unlimited | **Free, official** |
| **dane.gov.pl REST API** | $0 free | unlimited | unlimited | **Free, official Polish gov aggregator** |
| **CEIDG official API** | $0 free | unlimited (з registration) | unlimited | **Already integrated у Sztab** |
| **OSM Overpass API** | $0 free | rate-limited per IP | sufficient | **Free** |
| **Wikidata SPARQL** | $0 free | rate-limited | sufficient | **Free** |
| **beneficjenciwpr.minrol.gov.pl API** | $0 free (з registration) | sufficient | $0 | Free, official |
| Anthropic Haiku | $0.80/1M input + $4/1M output | n/a | $13-40/mo | Same as v1 |

### Total monthly budget (revised — Vadym was right, v1 was 1.5-2× over)

| Scenario | Apify | Tavily | Anthropic | Other | Total |
|---|---|---|---|---|---|
| **Tier 1 minimal** (KRS-fullnames + WWW + Panorama + Tavily + AI) | Free $5 credit covers | $30 | $13-40 | $0 | **~$43-75/mo** |
| **Tier 1 з KRS Financial proxy** | Starter $29 + ~$30 proxy | $30 | $13-40 | $0 | **~$102-129/mo** з proxy ⚠️ |
| **Tier 1+2 без KRS Financial proxy** | Starter $29 (covers regdata family + Panorama + ALEO + GMaps) | $30 | $13-40 | $0 (free APIs) | **~$72-99/mo** |
| **Tier 1+2 з KRS Financial proxy** | Starter $29 + $30-100 proxy | $30 | $13-40 | $0 | **~$102-200/mo** з proxy |

**Critical caveat:** regdata/poland-krs-financial-scraper "Under maintenance" badge + Incapsula WAF на e-sprawozdania.mf.gov.pl portal означає що **either need PL residential proxy ($30-100/mo additional) OR skip this source.** Free Apify proxies likely won't bypass.

**Recommendation:** Skip regdata/poland-krs-financial у MVP. **Real bootstrap budget ~$72-99/mo** — Vadym's "$30-50/mo initial" reasonable якщо без financial scraper, або із ним $100-200/mo.

---

## 3. Effort reality check (revised)

Оригінальні Vadym ETA + my critique з v1 still stand — без changes для unmodified items. Updates тільки для нових Polish actors:

| New Polish actor | Effort estimate | Critique |
|---|---|---|
| **regdata/krs-fullnames-scraper** | **~30 min** | Wire trivial — same `enrichContactsApify` pattern. NO complexity expected. |
| regdata/krz-debtor-scraper | ~1 day | Wire pattern identical. JWT session via Puppeteer = managed by actor (no Sztab effort). |
| regdata/knf-registry-scraper | ~1 day | Same. |
| regdata/crbr-beneficial-owners-scraper | ~1.5 days | Incapsula WAF + reCAPTCHA risk коли activated. Need fallback логіка. |
| **regdata/poland-krs-financial-scraper** ⚠️ | **~3-5 days** (NOT 1 day як v1 estimated) | Wire 1 day + proxy contract setup + monitoring + retry logic для WAF blocks. Real complexity. |
| regdata/msig-scraper | ~1 day | Cleanup existing lib/enrichment/msig.ts (legacy partial impl). |
| alwaysprimedev/panoramafirm-scraper | ~1 day | Multi-data-point output normalization. |
| Apify ALEO scrapers | ~2-3 days з ToS audit | ALEO ToS prohibits scraping. Polish lawyer consult ~500 zł якщо Sztab persists ALEO data. |
| GUS BDL official API | ~1-2 days | Endpoint discovery + dataset normalization. Free, no anti-bot. |
| dane.gov.pl REST API | ~1 day | Aggregator REST simple. Datasets coverage variable. |
| beneficjenciwpr.minrol.gov.pl official API | ~2 days з API token registration | Free but registration via biznes.gov.pl. Token TTL unknown — refresh logic потрібно. |
| OSM Overpass + Wikidata | ~1 day each | Free, no auth, well-documented. Polish entity coverage variable. |
| Polagra/EuroGastro fair scrapers (custom) | ~3-5 days | Annual catalogs, HTML structure changes year-on-year. Maintenance debt. |

### Hidden complexity flags (additional)

1. **regdata maintainer = startup** (Nov 2025 join, low actor popularity 2-39 users). Risk: actor deprecation when gov portal changes structure (already happened з EKW per agent finding). Sztab dependency = single-point-of-failure.
2. **Apify free tier $5 platform credit** covers ~$5-15 of pay-per-event scraping monthly. **For 264 firms × 5 sources × ~$0.005/each = $6.60/month** — actually fits free tier якщо all scrapers cheap. Starter $29 only needed якщо more aggressive volume.
3. **e-sprawozdania.mf.gov.pl Incapsula WAF**: actor regdata/poland-krs-financial has badge "Under maintenance" саме через WAF challenges. Apify Residential proxy $20+/mo may not be sufficient — потрібно PL-specific proxy (Bright Data PL ~$50/mo).
4. **Polish gov registry rate limits** (mapadotacji etc.): not documented, scraping may trigger IP bans. Need Cowork-side rate limiting.

---

## 4. Architecture critique — REVISED з Vercel Pro option

### A. Phase B chunks (unchanged from v1)

Still recommended підхід:
- B1 sync ~30s — identity sweep (GUS, KRS public, VAT, rejestrio basic)
- B2 sync ~60s — heavy network calls (Apify GMaps, Panorama, Tavily, ALEO)
- B3 delayed after() ~60s — slow Apify (KRS financial з proxy retry, MSiG)
- B4 final sync ~30s — AI synthesis + match rescore

### B. Vercel Pro vs Inngest decision matrix (NEW)

| Criterion | Vercel Hobby (current) | **Vercel Pro $20/mo** | **Inngest Free** | Trigger.dev Free |
|---|---|---|---|---|
| Cost | $0 | $20/seat/month | $0 | $5 free credit/month |
| maxDuration | 60s default (Edge 25s response) | **60s default + Fluid Compute 800s ceiling** | n/a (workflow native) | n/a |
| Concurrent runs | n/a | n/a | НЕ documented free tier | **20 concurrent** (Vadym had wrong "10") |
| Step retries | manual | manual | **automatic per step** | automatic |
| Workflow durability | best-effort after() | best-effort after() | **DURABLE** | DURABLE |
| Observability | minimal logs | better logs | **excellent dashboard** | good |
| Local dev | hard | hard | **excellent dev mode UI** | good |
| Free tier на 264-firm scale | OK для testing | OK | **50K runs/month** з запасом 25-35× | 20 concurrent — тісно |
| Migration cost | $0 | $0 (just maxDuration tweak) | 5-7 days refactor | 5-7 days refactor |

### Honest recommendation для Sztab 264-firm scale

**Verdict: Vercel Pro $20/mo + Inngest Free** — **best cost/feature ratio**.

Rationale:
- Vercel Pro потрібен **regardless** для production deployment (build minutes, bandwidth, edge functions). Це не optional якщо Sztab наближається до production.
- **Vercel Pro maxDuration 60s default** не вирішує SOLERA 244s wall-clock issue. Pro alone insufficient.
- Inngest Free 50K runs/month covers 25-35× Sztab needs з step retries + durability + observability dashboard. Free tier!
- Migration to Inngest 5-7 days — sunk cost vs ongoing $20-100/mo savings.
- **Trigger.dev Free 20 concurrent тісно** — fan-out до 50+ паралельно not possible.

**Alternative для cost-conscious Vadym:** stay Vercel Hobby + cache aggressively + chunk Phase B into 2 phases (sync ≤25s + after() ≤60s). Avoids both Pro upgrade AND Inngest migration. **Trade-off:** no step retries, no durability, no dashboard observability — debugging production issues harder.

### C. Cache layer (unchanged from v1)

Still STUB у `lib/intelligence-engine/core/cache-layer.ts`. **Sprint S6D-prep STILL precondition.**

Schema recommendation:
```sql
CREATE TABLE enrichment_cache (
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  source TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  cost_usd NUMERIC,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (target_type, target_id, source)
);
CREATE INDEX idx_enrichment_cache_expires ON enrichment_cache(expires_at);
```

TTL strategy refined per source:
- Identity sources (KRS, GUS, CEIDG, VAT): **30 days** (rarely change)
- Financial sources (sprawozdania): **90 days** (annual filings)
- Network sources (person-network, CRBR): **30 days**
- Web sources (Tavily, WWW direct): **7 days**
- Social signals (Apify GMaps, Panorama): **14 days**
- Hot signals (BZP tenders, MSiG, KRZ debtor): **3 days**
- Trade fairs (annual): **180 days**

### D. AI prompt rewrite (unchanged from v1)

Still recommend Option AI-C: 5 parallel Haiku mini-prompts + 1 Sonnet synthesis. Multi-step approach addresses "Google AI Overview quality" goal.

### E. UI tabs (unchanged from v1)

Existing `<Tabs>` shadcn pattern (used у aktywnosc accordion lines 391-407 of /clients/[id]/page.tsx) reusable. Source: profile / personnel / financial / signals / network tabs.

---

## 5. Source priority — Vadym's re-ranking ACCEPTED з minor adjustments

Vadym's proposal:
1. regdata/krs-fullnames-scraper (30 min) — **ACCEPTED ⭐**
2. Cache layer (2 days) — **ACCEPTED**
3. Tavily multi-pass (half day) — **ACCEPTED**
4. WWW direct fetch (2-3 days) — **ACCEPTED**
5. rejestrio person-network (1-2 days) — **ACCEPTED**
6. alwaysprimedev/panoramafirm-scraper (1 day) — **ACCEPTED**
7. regdata/poland-krs-financial-scraper (1 day wire) — **MODIFIED: defer до Tier 2 OR allocate proxy budget $30-100/mo upfront**
8. Apify ALEO scraper (2 days) — **ACCEPTED з ToS caveat**

**Cowork's suggested addition pre-#1 (optional debate):**
- ⚠️ Sprint S6C-followup-Tavily-multipass (item #3 у Vadym list) є critical для understanding clients accurately. Якщо AI пише hallucinations через bad Tavily data, KRS-fullnames fix не buys us "Google AI Overview quality" — it just gives us correct names but still wrong analysis.

**Revised order proposal:**
1. ⭐ regdata/krs-fullnames-scraper (30 min) — solves anonymous PREZES
2. ⭐ Tavily multi-pass + .pl filter (half day) — solves SOLERA hallucination
3. Cache layer (2 days) — economics foundation
4. WWW direct fetch (2-3 days)
5. rejestrio person-network (1-2 days)
6. alwaysprimedev/panoramafirm-scraper (1 day)
7. (defer regdata/poland-krs-financial-scraper до Tier 2 unless Vadym accepts proxy budget)
8. Apify ALEO scraper (2 days з ToS caveat)

Items 1+2 паралельно — both ~half day each, deliver Vadym immediate visible wins.

---

## 6. Missing sources — DEEP DIVE з verified accessibility (REVISED)

### 6.1 Polish gov registries — verified scraping feasibility

| Registry | Programmatic access | Anti-bot | Apify actor | Custom effort |
|---|---|---|---|---|
| **CEIDG** (already integrated) | ✅ Official `dane.biznes.gov.pl/api/ceidg/v2/firmy` JWT | none (token-based) | trev0n/ceidg-scraper $15/mo (bad pricing) | 0 days (already done) |
| **dane.gov.pl** | ✅ FREE REST `api.dane.gov.pl/1.4/` JSON | none | not needed | 0-1 day integration |
| **GUS BDL** | ✅ FREE REST `bdl.stat.gov.pl/api/v1/` з optional X-ClientId | none | not needed | 1-2 days |
| **beneficjenciwpr.minrol.gov.pl** | ✅ Official API "Wykaz-beneficjentow-WPR v.2.0" з registration | none (auth) | NO | 1-2 days з token |
| **mapadotacji.gov.pl** | ❌ NO public REST API; contact mapa@miir.gov.pl | unknown — JS-rendered | NO | 3-5 days HTML scrape (332K projects) |
| **sad.gov.pl** (court verdicts) | not verified | likely Cloudflare | NO | 5-7 days |
| **kowr.gov.pl** | not verified | likely none | NO | 3-4 days |
| **kep.mf.gov.pl** | not verified | unknown | NO | 4-5 days |
| **rnp.podatki.gov.pl** | not verified | unknown | NO | 5-7 days |
| **krd.pl** (commercial debt) | ✅ SOAP/REST API on info.krd.pl/Programista, **PAID** | n/a (auth) | NO | 2-3 days з contract — out of MVP scope |
| **e-sprawozdania.mf.gov.pl** | ⚠️ READ portal має Incapsula WAF; WRITE API exists для submission only | WAF | regdata Apify (via WAF bypass) | already covered |

**HoReCa relevance:** mapadotacji.gov.pl (EU funds) potentially useful для food processing grants, але weak signal. CEIDG + GUS + dane.gov.pl cover ~80% of public-data needs.

### 6.2 Polish trade associations — directory access

| Association | Access | Effort | HoReCa relevance |
|---|---|---|---|
| PIH (Polska Izba Handlu) | Public HTML "Nasi Członkowie" alphabetical | ~1 day scrape | High — retail/wholesale members |
| POHiD (Polska Org. Handlu i Dystrybucji) | Public `/o-nas/czlonkowie/` (~30 firms HQ-only) | ~0.5 day | Low — only big chains (Auchan, Carrefour, Żabka) |
| KIG (Krajowa Izba Gospodarcza) | Not verified | unknown | Generic, not HoReCa-specific |
| PFPZ (Polska Federacja Producentów Żywności) | Public single HTML page | ~0.5 day | High — food producers/wholesalers |
| KIGS (Krajowa Izba Gospodarki Spożywczej) | Not verified | unknown | High potential |
| Stowarzyszenie Hurtowników HoReCa | Not verified — agent did not check | TBD | High potential |

**Brutal honest:** Trade associations dump чимало brand names але без individual decision makers / outlet operators. Useful для chain mapping (Phase 2 — мережі), не для primary client lookup.

### 6.3 HoReCa-specific data sources (verified)

| Source | URL | Access | Effort | Value |
|---|---|---|---|---|
| **Polagra Food** annual exhibitor list | polagra.pl/en/visitors/important-information/exhibitors-list/ + catalog | Public HTML, ~200-337 entries/year | ~1 day scrape | **HIGH — intent signal** (booth = active buyer/supplier) |
| **EuroGastro** annual exhibitor list | eurogastro.com.pl/en/exhibitors-catalog-2024/ + 2025 | Public HTML PL+EN | ~1 day | **HIGH** |
| Foodservice Poland industry awards | not verified | unknown | TBD | Medium |
| Hurt&Detal / hurtidetal.pl | not verified | likely articles | reuse Tavily | Medium — content not directory |
| dlahandlu.pl | not verified | likely articles | reuse Tavily | Medium |
| Restaurator Polski / Świat Smaku | not verified | likely articles | reuse Tavily | Low priority |
| Slow Food Polska directory | slowfood.pl — small, ~12 endorsed restaurants Małopolska | Public | ~0.5 day | Low — niche |
| **HoReCa Forum, Targi Smaku Wschodu** | not verified | TBD | TBD | Probably medium |

**Brutal honest:** Exhibitor lists Polagra/EuroGastro = **GOLD** (active firms з website + contact, intent signal). Trade media = content-only, не structured directories — reusable through Tavily з domain whitelist.

### 6.4 Geographic/location intelligence

| Source | Access | Effort | Notes |
|---|---|---|---|
| **OSM Overpass API** | Free public, IP rate-limited (specifics not documented) + alt overpass.kumi.systems unlimited commercial | ~1 day integration | Query: `[out:json];area["ISO3166-1"="PL"]->.pl; node["amenity"="restaurant"](area.pl); out body;` |
| **Wikidata SPARQL** | Free public endpoint `query.wikidata.org/sparql` | ~1 day | Polish wholesale companies via P31 + P17=Q36. Limited coverage SMEs, gold для chain HQs |
| **GUS BDL** | ✅ FREE official REST `bdl.stat.gov.pl/api/v1/` | ~1-2 days | Local economic indicators per powiat: income, demographics, food spending |

**HoReCa application:**
- OSM: build local restaurant density map per voivodeship → spot underserved regions
- Wikidata: enrich chain entries (Żabka, Lewiatan etc.) з wikidata IDs для cross-reference
- GUS BDL: enrich client_target з local food spending stats — refines buyer_strength_for_chm (high-income powiat = better target)

### 6.5 Sources NOT VERIFIED by agent (caveats)

Agent listed explicitly як not verified in TASK 2/3/4: `kig.pl`, `KIGS`, `sad.gov.pl`, `kowr.gov.pl`, `kep.mf.gov.pl`, `rnp.podatki.gov.pl`, EuroGastro full member walk, HoReCa Forum, Hurt&Detal, dlahandlu.pl, Restaurator Polski, Hotelnews PL, Targi Smaku Wschodu, EU agro associations.

Якщо Vadym wants any of цих — окремий verification spike before commit.

---

## 7. AI architecture (unchanged from v1)

Multi-step з 5 parallel Haiku mini-prompts + Sonnet synthesis. Validation layer з retry на keyword check.

(See v1 Section 7 для detailed analysis — recommendation unchanged.)

---

## 8. Tavily query specificity (unchanged from v1)

Multi-pass strategy:
- Pass 1: `"SOLERA" sp. z o.o. Warszawa 5262870489` (discriminator-loaded)
- Pass 2: `"SOLERA" Przasnyska Warszawa hurtownia` (address-based)
- Pass 3: `"SOLERA" hurtownia` з `include_domains: ['hurtidetal.pl', 'rynekgastronomiczny.pl', 'dlahandlu.pl']`

Plus `country: "poland"` (lowercase full English name, не 'pl' як було Issue A).

Plus post-fetch domain TLD filter (.pl preferred, exclude foreign aggregators).

(See v1 Section 8 для detailed analysis — recommendation unchanged.)

---

## 9. Phase B execution model — REVISED з Vercel Pro option

### Decision matrix (revised)

| Criterion | A. Vercel Hobby (current) | B. **Vercel Pro $20/mo** | C. **Inngest Free + Pro** | D. Trigger.dev Free + Pro |
|---|---|---|---|---|
| Total Cost | $0 | $20/seat | $0 (free) + $20 Pro = $20 | $5 credit + $20 Pro = $20 |
| maxDuration | 60s | 60s + Fluid Compute 800s | n/a (workflow) | n/a |
| Concurrent | n/a | n/a | НЕ documented | 20 (free) → 50+ paid |
| Step retries | manual | manual | automatic | automatic |
| Durability | best-effort | best-effort | **durable** | durable |
| Observability | basic | better | **best dashboard** | good |
| Migration effort | 0 | 0 | 5-7 days | 5-7 days |

### Honest recommendation для Sztab 264-firm-scale

**Cowork verdict: Option C — Vercel Pro $20/mo + Inngest Free**

Rationale per Vadym's budget-conscious context:
- Vercel Pro $20 потрібен **regardless** для production scaling (build minutes, bandwidth) — це не Phase B-specific cost, це baseline production hosting.
- Inngest Free 50K runs/month covers 25-35× Sztab Phase B needs з step retries + durability + dashboard observability.
- 5-7 days migration effort = **one-time cost vs ongoing Vercel Pro overage savings + dev velocity (Inngest dashboard >>>> Vercel logs)**.
- Trigger.dev Free 20 concurrent — тісно для broadcast architecture (264 firms × 5+ sources fan-out). Free tier insufficient.

**Alternative для immediate Vadym shipping без 5-7 day migration:**
- **Option B: Vercel Pro $20/mo + Phase B refactor to ≤60s sync chunks** — buys time. Sztab уже на Hobby tier hits 244s SOLERA wall-clock. Pro з Fluid Compute 800s ceiling solves чисто immediate timing issue. Inngest migration deferred до Q3.
- Caveat: Fluid Compute Pro ceiling 800s applies до Edge Functions з specific config. Default Vercel Pro = 60s. Vadym має confirm Fluid Compute setup matches Sztab's serverless functions (not edge).

---

## 10. Custom Apify actor strategy — NEW SECTION

### Build vs Buy decision framework

| Criterion | Build custom Apify actor | Buy existing Apify actor | Use direct API |
|---|---|---|---|
| **Effort** | 2-5 days build + ongoing maintenance | 30 min - 1 day wrap | 0-2 days integration |
| **Ongoing cost** | Apify execution + dev time | Apify per-event pricing | $0 (free APIs) або pay-as-you-go |
| **Reliability** | Risk of source HTML structure changes | Maintainer responsible | Most reliable (official) |
| **ToS risk** | YOU bear liability як scraper author | Author bears risk (some) | None (auth'd) |
| **Maintenance** | Ongoing bug fixes when source changes | Minimal | Minimal |

### Decision rules per source category

**ALWAYS use direct API якщо exists** (highest reliability, lowest cost):
- CEIDG ✅ (already integrated)
- dane.gov.pl ✅
- GUS BDL ✅
- beneficjenciwpr.minrol.gov.pl ✅
- KRS public ms.gov.pl ✅ (already integrated)
- VAT BL ✅ (already integrated)
- BZP ✅ (already integrated)
- OSM Overpass ✅
- Wikidata SPARQL ✅
- KRD (paid) ✅ якщо Vadym budget allows

**BUY Apify actor якщо:**
- Source has no official API (most Polish gov registries with anti-bot)
- Existing actor maintainer reliable (regdata = 9 actors, fresh updates, low ToS issues для public registries)
- Cost <$0.01/result (virtually all regdata actors qualify)
- ToS risk LOW або MEDIUM with acceptable mitigation

Examples:
- regdata/krs-fullnames-scraper (LOW ToS — public PDF) ✅
- regdata/msig-scraper (LOW ToS — public registry) ✅
- regdata/krz-debtor-scraper (LOW ToS) ✅
- regdata/knf-registry-scraper (LOW ToS — public regulatory data) ✅

**BUILD custom actor — ONLY якщо:**
- Source critical для business (e.g. Polagra exhibitor list — annual gold для HoReCa)
- No existing actor exists
- 50+ Sztab users per month would benefit
- ToS allows або gray-zone z Polish lawyer consult ($500-1000 zł)
- ROI justified vs ongoing maintenance debt

Examples worth custom build:
- **Polagra Food + EuroGastro exhibitor scrapers** (annual fairs, no existing actors, gold для HoReCa intent signal) — YES build
- **mapadotacji.gov.pl scraper** (EU funds) — questionable, HoReCa relevance medium-low

**SKIP entirely:**
- Sources з HIGH ToS risk + no existing actor + low ROI (e.g. Pyszne.pl/Glovo/Wolt scraping)
- Sources з ToS-protected platforms (LinkedIn, Instagram, Facebook) without Polish legal review
- Sources з low data quality (small directories, stale data, unstructured content)

### Custom Apify actor build process (якщо decided)

1. **ToS audit** (~1 day): Read robots.txt + ToS. Document gray-zone justification.
2. **Apify CLI scaffold** (~half day): `apify create new-actor` template.
3. **Page parser** (~1-2 days): HTML extraction logic, anti-bot handling (User-Agent, Apify Residential proxy if needed).
4. **Schema design** (~half day): Output normalization до Sztab company_profile_fields format.
5. **Testing + monitoring** (~half day): Apify run logs, error rate alerts.
6. **Deploy + Sztab wire** (~half day): Actor publish, lib/enrichment/* wrap pattern matches existing apify.ts.

**Total: 3-4 days per custom actor.** With 264 firms × monthly run, breakeven якщо source delivers >$0.50/firm value.

### Risks (custom actors)

1. **Source HTML structure changes** — actor breaks silently. Need monitoring (success rate, error codes).
2. **Anti-bot escalation** — Cloudflare/Akamai blocks → fallback to residential proxy ($30-100/mo additional cost).
3. **ToS C&D** — owner sends cease-and-desist. Need quick disable + fallback strategy.
4. **GDPR personal data** — якщо scraper collects employee opinions / emails / addresses, Sztab is data controller з obligation to honor erasure requests.

### Recommended custom actor list для Sztab MVP (priority order)

1. **Polagra Food exhibitor scraper** (annual, ~200-337 entries, HoReCa gold) — 3-4 days build, $0 ongoing if cached annually
2. **EuroGastro exhibitor scraper** (annual, similar) — 3-4 days build
3. **(deferred) mapadotacji.gov.pl** — 5-7 days build, low priority

**Skip (clear ROI absence):**
- Pyszne.pl/Glovo/Wolt — no actors exist + ToS prohibits + custom build risky
- LinkedIn/Instagram/Facebook — ToS + GDPR risk too high

---

## Summary recommendations v2

### For Vadym IMMEDIATE (today/this weekend):

⭐ **Sprint S6C-followup-WIN (~1 hour total):**
1. Wire `regdata/krs-fullnames-scraper` (~30 min) — solves "(KRS anon) PREZES" bug. Cost $1.32 для 264 firms. Vadym immediate visible win.
2. Tavily multi-pass query rewrite (~half day) — solves SOLERA hallucination.

### For 2-week sprint (Sprint S6D-prep + S6D revised):

🔥 **S6D-prep** (~2 days, PRECONDITION): Cache layer Supabase table.
✅ **S6D Tier 1** (~1.5-2 weeks):
- WWW direct fetch з anti-bot fallback
- rejestrio person-network wire
- alwaysprimedev/panoramafirm-scraper wire
- regdata/poland-krs-financial-scraper з proxy budget OR defer
- ALEO Apify scraper (з ToS caveat)
- GUS BDL official API (free, multi-day)
- CEIDG official API expansion (already done partial)
- dane.gov.pl REST integration

### For 3-4 week sprint (Sprint S6E):

- regdata/msig-scraper, krz-debtor-scraper, knf-registry-scraper (regdata family wire pattern repeated)
- Polagra + EuroGastro custom exhibitor scrapers (annual gold)
- OSM Overpass + Wikidata SPARQL queries
- Polish trade associations (PIH, PFPZ public directory scrape)
- beneficjenciwpr.minrol.gov.pl official API

### For migration (Sprint S6G, ~1 month out):

- **Option C: Vercel Pro $20/mo + Inngest Free migration** (5-7 days). Best long-term cost/feature.
- **Alternative Option B: Vercel Pro з Fluid Compute** (no migration, defers Inngest decision).

### For AI rewrite (Sprint S6H):

- Multi-step з 5 parallel Haiku mini-prompts + Sonnet synthesis (~1 week).

### Realistic monthly external API budget (revised):

- **Tier 1 minimal (без KRS Financial proxy):** ~$43-75/mo
- **Tier 1+2 без KRS Financial proxy:** ~$72-99/mo
- **Tier 1+2 з KRS Financial proxy:** ~$102-200/mo
- **+ Vercel Pro $20/mo** = total ~$92-220/mo

Vadym's "$30-50/mo initial" reasonable якщо без KRS Financial scraper.

### Honest filter — sources NOT to implement:

| Source | Why skip |
|---|---|
| Allegro Business для clients | Low ROI (5-15% HoReCa B2B на Allegro) |
| WHOIS/DNS | Weak actionable signal |
| Static PKD mapping | Already у DB (krs_pkd_with_descriptions) |
| Wayback Machine | Marginal value |
| LinkedIn/Instagram/Facebook | ToS + GDPR risk |
| Pyszne.pl/Glovo/Wolt | No actors + ToS prohibits |
| Kompass.pl | Unverified, redundant з ALEO |
| OpenCorporates paid | Not justified vs rejestrio |
| EU funds (mapadotacji manual scrape) | Weak HoReCa signal |
| trev0n/regon-scraper | Existing GUS works |
| trev0n/ceidg-scraper $15/mo subscription | Bad pricing model + Vadym already has CEIDG integration |
| BDO waste registry | Rarely actionable for HoReCa |
| UOKiK clauses | Rarely actionable |
| KRD commercial debt | Paid, MVP scope creep |
| Tier 4 deep DD | On-demand only |

### Win/loss summary v2 vs v1

**v2 wins:**
- 9 verified Polish-specific Apify actors mapped (was 0 у v1)
- Cost projections corrected (33-50% over в v1)
- Vercel Pro option added as alternative to Inngest
- Custom actor build framework formalized (Section 10)
- HoReCa-specific gold sources identified (Polagra/EuroGastro fairs)

**v2 honest red flags новими:**
- regdata/poland-krs-financial-scraper "Under maintenance" + WAF = real cost з proxy не $0.005/firm
- regdata maintainer = startup (Nov 2025 join, low actor popularity 2-39 users) = sustainability risk
- Aleo actors low popularity = deprecation risk
- Vercel Pro maxDuration 60s default — alone не вирішує SOLERA timing

**Action items для Vadym (priority order):**
1. ⭐ TODAY: Wire regdata/krs-fullnames-scraper (30 min) + Tavily multi-pass (half day)
2. THIS WEEK: Sprint S6D-prep cache layer (2 days)
3. NEXT 2 WEEKS: Sprint S6D Tier 1 revised (8 sources, ~1.5-2 weeks)
4. NEXT MONTH: Sprint S6E Tier 2 (+regdata family, custom Polagra/EuroGastro)
5. Q3: Vercel Pro + Inngest migration якщо Phase B issues persist
