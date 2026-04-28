# Sprint I — Pre-Apify quality gate (auto filters + manual review)

Sprint H closed Apify integration з honest finding: free tier 8192MB cap
+ slow actor cold-start = ~50 contacts per realistic batch. Strategic
priority **CONVERSION** не scale — kожen Apify lookup має бути виправданим.

Sprint I додає **two-layer quality gate** перед Apify spend.

## Layer 1 — automated hard filters (~70-80% mismatch виключено)

Computed inline у API endpoints (not stored — Postgres GENERATED columns
не підтримують cross-table refs):

```
combined_score >= 70                                           (raised z 60)
AND PKD HoReCa-relevant — first 2 digits ∈ {47, 56, 10, 11, 46}
  - clients: any code ∈ pkd_2007_codes
  - prospects: pkd_main first 2 digits
AND status active
  - clients: vat_status ILIKE 'czynny'
  - prospects: ceidg status = 'AKTYWNY'
AND nip NOT NULL AND nip != ''
AND city/miejscowosc NOT NULL AND != ''
AND (registered_date IS NULL OR registered_date < NOW() - INTERVAL '6 months')
```

**Pool count after Layer 1**: 8,023 matches (з 10,190 з combined ≥ 60 = -21%).

## Layer 2 — manual review UI

`/matches/review` — Vadym sees TOP-50 candidates after Layer 1, per-row 
toggle Approve / Skip, bulk actions. Тільки `apify_review_status='approved'` 
matches йдуть на Apify endpoint.

```
match.apify_review_status: 'pending' | 'approved' | 'skipped'
match.apify_reviewed_at TIMESTAMPTZ
match.apify_reviewed_by TEXT (= user.email)
```

## Architectural deviation з spec

Spec asked GENERATED ALWAYS AS STORED `apify_eligible` column referencing
clients/prospects через PKD/VAT/registered_date. Postgres GENERATED columns
**cannot reference other tables** — only same-row expressions.

**Resolution**: skip generated col, compute eligibility inline at query
time. Cleaner ніж denormalizing eligibility data onto matches table at
DELETE+INSERT recompute time. Filter logic centralized у one query
(`/api/matches/apify-queue`).

## Endpoints

```bash
# Get review queue (TOP-50 eligible, with approval state)
curl 'https://sztab.vercel.app/api/matches/apify-queue?limit=50'

# Approve / skip / reset single match
curl -X PATCH 'https://sztab.vercel.app/api/matches/{match_id}/review' \
  -H 'Content-Type: application/json' \
  -d '{"status":"approved"}'

# Bulk approve / skip (max 500 per call)
curl -X PATCH 'https://sztab.vercel.app/api/matches/apify-queue/bulk-review' \
  -H 'Content-Type: application/json' \
  -d '{"match_ids":["uuid1","uuid2"],"status":"approved"}'

# Run Apify (now requires apify_review_status='approved') — returns 400 if 0 approved
curl -X POST 'https://sztab.vercel.app/api/admin/enrich/apify-batch' \
  -H 'Content-Type: application/json' \
  -d '{"source":"mixed","min_combined_score":70,"limit":50}'
```

## UI workflow

1. Open `/matches/review` (sidebar entry "Pre-Apify review")
2. Inspect TOP-50 candidates (sorted by combined_score DESC)
3. For each — click ✅ Approve або ✗ Skip (або use bulk actions)
4. AI reasoning expands inline (collapsible) — read context перед deciding
5. Header CTA "Run Apify on approved (N)" — disabled if 0
6. Cost estimate shown live: approved × $0.021 max (NIP dedup zmniejsza)

## Adjusting filters якщо pool замалий

Якщо `eligible_count < 30`:
- **Lower combined_score threshold**: edit `/api/matches/apify-queue/route.ts` 
  → change `gte('combined_score', 70)` to 60 or 65
- **Expand HoReCa divisions**: spec uses {47,56,10,11,46}. Add 49 (transport
  for delivery cases) or 47.91 (e-commerce only).
- **Drop registered_date filter**: для seed cases де dates not yet enriched,
  remove the `>6mc OR null` clause

After adjustment — re-deploy, recheck count, iterate.

## Workflow з Sprint H integration

Pre-existing Sprint H buttons на /matches/global — "Apify (TOP-50)" and 
"Export Pikniko CSV" — still work, але **Apify button тепер фактично hits
review queue gate**. Якщо нема approved matches → 400 з message "Brak
approved matches w kolejce. Otwórz /matches/review".

Recommended sequence:
1. L5 algo bulk → L6 AI bulk (z /matches/global header) → freshly scored pool
2. /matches/review → review TOP-50, approve good ones (~10-20 min Vadym manual time)
3. /matches/review → "Run Apify on approved" CTA → batch executes
4. /admin/health → verify Apify spend
5. /matches/global → "Export Pikniko CSV" → download з phone/email/website
6. Send to Pikniko

## Sample Layer 1 verification

5 random TOP rows після filter (manually inspected):
| match_id (8) | type | name | nip | city | status | pkd |
|---|---|---|---|---|---|---|
| e497c412 | P | LUCKY PING ZHAO | 5273141191 | Warszawa | AKTYWNY | 5610A |
| 5d3315e3 | P | Dorota Kostro-Madej | 5321179844 | Warszawa | AKTYWNY | 5610A |
| bf291854 | P | Krzysztof Lech | 9491834994 | Warszawa | AKTYWNY | 5610A |
| 634de58e | P | LUCKY PING ZHAO | 5273141191 | Warszawa | AKTYWNY | 5610A |
| 26391139 | P | LUCKY PING ZHAO | 5273141191 | Warszawa | AKTYWNY | 5610A |

All pass: PKD 5610A (division 56 = HoReCa ✅), CEIDG AKTYWNY ✅, NIP+city ✅.
3/5 LUCKY PING ZHAO duplicates (different products) — review UI lets Vadym
approve 1 representative; Pikniko export deduplicates by NIP automatically.

## Non-goals reminder

- Auto-approve based на історичних patterns — premature, не scale this sprint
- ML model для score adjustment — Sprint J+
- Voivodeship distance — separate sprint
- Запуск Apify batch у цьому sprint — Vadym сам тригерне після review
- Async Apify refactor — Sprint J candidate

## Sprint J candidates

1. **Async Apify pattern** — start run + poll status + DELETE on cancel.
   Eliminates orphan run consumption of memory quota.
2. **Voivodeship distance** — real geo signal на L5 коли suppliers add service zones.
3. **Pikniko feedback loop tracking** — record converted leads, calibrate
   scoring thresholds based on outcomes.
4. **Auto-rerun scheduler** — fresh Apify enrichment коли expires_at нulls
   у contact_enrichment.
