# Sprint H — Apify contact enrichment + Pikniko handoff

Sprint G left a TOP-100 view з AI-rescored matches but без contact details.
Sprint H closes the loop: pulls phone/email/website з Google Maps via Apify,
generates first Pikniko handoff CSV.

## Apify pipeline

`lib/enrichment/apify.ts` — `enrichContactsApify(apiKey, target)`:
- Actor: `compass/crawler-google-places` ($0.007/result, simple shape)
- Endpoint: `POST {APIFY_BASE}/acts/compass~crawler-google-places/run-sync-get-dataset-items`
- Query: `"{name} {city|voivodeship} Polska"`
- Picks best match via inline Levenshtein (≥0.5 similarity, single-result permissive)
- Status: `success` (≥1 contact field) | `partial` | `no_match` | `error`
- Rate limit: 30 calls/min (in-memory token bucket)
- Retries: 3× з exp backoff на 5xx (1s/2s/4s)

`lib/enrichment/apify-batch.ts` — `buildBatchPlan()` + `executeBatch()`:
- Pull TOP-N matches by combined_score, dedup by NIP (highest-scoring per NIP wins)
- Track all `target_id`s sharing each NIP (client+prospect overlap case)
- 1 Apify call per unique NIP, write-back row для KOŻDEGO target_id
- Cost guard: estimated > `budget_usd` → 400 з plan для review

## Cost expectations

| Operation | Cost |
| -- | -- |
| Single lookup | ~$0.007–$0.021 (1–3 results) |
| TOP-50 batch (deduped NIPs) | ~$0.35–$1.05 |
| Daily budget alarm | $10/week soft warning на /admin/health |

Path B dedup (per Vadym Step 0 decision) — same prospect appearing у TOP-N
з різних SKU otrzymuje 1 lookup, не N. У наших даних LUCKY PING ZHAO був 14×
у TOP-20 → з dedup це 1 call.

## Endpoints

```bash
# Bulk batch — dry run (returns plan only, no API spend)
curl -X POST https://sztab.vercel.app/api/admin/enrich/apify-batch \
  -H 'Content-Type: application/json' \
  -d '{"source":"mixed","min_combined_score":60,"limit":50,"dry_run":true}'

# Bulk batch — execute (with $5 budget cap default)
curl -X POST https://sztab.vercel.app/api/admin/enrich/apify-batch \
  -H 'Content-Type: application/json' \
  -d '{"source":"mixed","min_combined_score":60,"limit":50}'

# Single prospect / client
curl -X POST https://sztab.vercel.app/api/prospects/{uuid}/enrich-apify
curl -X POST https://sztab.vercel.app/api/clients/{uuid}/enrich-apify

# Lookup latest enrichment
curl 'https://sztab.vercel.app/api/contact-enrichment?target_type=prospect&target_id={uuid}'

# Pikniko export (CSV downloaded)
curl -L -o handoff.csv \
  'https://sztab.vercel.app/api/export/pikniko-handoff?min_score=60&limit=50'
```

UI: на `/matches` → header buttons "Apify (TOP-50)" + "Export Pikniko CSV".
Per-row Contact column з 3 icons (📞 📧 🌐) + ⚡ button дla on-demand enrich
коли none yet.

## Pikniko CSV format

UTF-8 з BOM (Excel PL native), comma-separated, double-quoted, CRLF EOL.

Columns:
1. **Nazwa** — target name
2. **NIP**
3. **Typ** — Klient / Prospekt
4. **Also in other table** — `tak` if NIP istnieje у обох clients і ceidg_prospects
5. **PKD** — codes string (max 6, comma separated)
6. **Adres** — city / voivodeship
7. **Telefon** — Apify-fetched phone (може бути empty)
8. **Email** — Apify-fetched email (rare на Maps)
9. **Strona WWW** — Apify-fetched website
10. **Top Product** — best matched product name
11. **Combined Score** — 0–100
12. **AI Reasoning** — Polish 1-sentence reasoning з L6 rescore
13. **Suggested Opener** — z sales_snippet якщо generated, else empty

Filter `with_contacts_only=true` (default) skips rows без жоднего contact field.

## Cross-table NIP dedup (Krzysztof Lech case)

Same NIP може appear у обох:
- `clients` (Bitrix import + GUS-enriched)
- `ceidg_prospects` (CEIDG bootstrap)

Step 0 finding: `Krzysztof Lech` NIP `9491834994` був на rows #2 (client) AND #4
(prospect) у TOP-20.

Solution at export time: `DISTINCT ON (nip) ORDER BY nip, combined_score DESC` 
— pick higher-scoring representation, drop the other. Mark `also_in_other_table=true` so Pikniko бачить що це сполучене counterparty.

Solution at Apify time: same dedup — single Apify call per NIP, але INSERT
contact_enrichment ROW для kожного target_id sharing the NIP (so /clients/[id] та /prospects/[id] obie pages бачать the same contact).

## Observability

`/admin/health` тепер має 3 sections:
1. **Apify spend** (NEW) — 7d/30d totals, calls count, top-5 expensive enrichments
2. matching-refresh cron status
3. hygiene-scan cron status

Soft amber warning якщо 7d spend > $10. No alerts/notifications цей sprint.

## Smoke test

`scripts/smoke-test-apify.ts` — picks 3 prospects з різних воеводств (fallback дla unique-woj filter), runs `enrichContactsApify` на кожному, prints status + contact fields + cost. Acceptance: ≥2/3 status='success'.

Note: niche/regional Polish JDG businesses можуть НЕ бути в Google Maps. 
Result depends on actual coverage. `partial`/`no_match` status — нормально.

### Smoke run findings (initial — Sprint H closure)

Initial smoke з default config: **3/3 errors** ❌:
1. Norbert Masłowski MANO — client timeout @ 90s
2. LUCKY PING ZHAO — client timeout @ 90s
3. Oleh Hopchenko — Apify HTTP 402 `actor-memory-limit-exceeded`
   (account-wide 8192MB limit hit бо timed-out runs still consume slots
   на Apify server-side until 5min deadline)

Fixes applied (commits 7+):
- `REQUEST_TIMEOUT_MS`: 90s → 240s (cold-start ~30-60s + scraping)
- Run config: added `?memory=1024` query param (вместо default 4096) —
  allows up to 8 concurrent runs у межах 8192MB account quota

Re-smoke status: pending Apify slot free-up (5min server-side timeout
для abandoned runs) + Vadym verify. Document як ⚠️ acceptance criterion
#3 — code path correct, operational config tuned, real-world Apify
account constraints зробили initial run fail.

**Lesson**: Apify run-sync timeout commands client connection, but actor
keeps running на Apify side. Use shorter actor `memoryMbytes` config OR
async pattern (start run + poll + DELETE on cancel) для production.

## Next steps (Sprint I candidates)

1. **Voivodeship distance scoring** — geo signal на L5 коли suppliers add service zones
2. **Price tier auto-derive** — з product cost — для real `size_match` distinction
3. **rejestr.io integration** — chains/sp.z o.o./S.A. unlocks corporate buyers
4. **Auto-rerun scheduler** — re-enrich стales (>30d) at daily cron, similar до matching-refresh
5. **Pikniko feedback loop** — track which leads converted → calibrate scoring thresholds

## Non-goals reminder (cf spec)

- Phone/email format validation
- Outreach automation (we don't write/call leads)
- LinkedIn enrichment
- KRS rejestr.io
- Direct integration з Pikniko ERP (CSV handoff достатньо)
