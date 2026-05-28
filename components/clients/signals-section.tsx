// components/clients/signals-section.tsx
// Sprint S2B Phase 2E — Sygnały: last_filing freshness + red flags + BZP.
// Sprint S6B-UI-A (11.05.2026) — додано Apify Google Maps card +
// last 3 BZP tenders details. contact_enrichment data вже у DB
// (Phase B Apify_GMaps source) але не was rendered у UI.

interface ApifyGmapsData {
  status: string | null
  gmaps_rating: number | null
  gmaps_reviews_count: number | null
  gmaps_url: string | null
  phone: string | null
}

interface BzpTender {
  ordering_party: string | null
  award_date: string | null
}

interface Props {
  lastFilingDate: string | null
  bankruptcyFlag: boolean
  liquidationFlag: boolean
  restructuringFlag: boolean
  suspendedAt: string | null
  bzpCount: number
  /** Last 3 BZP tenders для inline display below count. */
  bzpRecent?: BzpTender[]
  /** contact_enrichment row з source='apify_gmaps' — null коли Phase B skipped Apify. */
  apify?: ApifyGmapsData | null
}

function freshnessBadge(date: string | null): { label: string; cls: string } {
  if (!date) {
    return { label: 'Brak ostatniego sprawozdania', cls: 'bg-[#F5F5F5] text-[#888]' }
  }
  const days = (Date.now() - new Date(date).getTime()) / 86_400_000
  if (days < 365) return { label: `Świeże (${date})`, cls: 'bg-[#DCFCE7] text-[#15803D]' }
  if (days < 730) return { label: `Stare (${date})`, cls: 'bg-[#FEF3C7] text-[#92400E]' }
  return { label: `Nieaktualne (${date})`, cls: 'bg-[#FEE2E2] text-[#991B1B]' }
}

function renderStars(rating: number): string {
  // 4.7 → "★★★★★" з муnich offset for visualization (full 5-star rendering)
  const full = Math.round(rating)
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full))
}

export function SignalsSection({
  lastFilingDate,
  bankruptcyFlag,
  liquidationFlag,
  restructuringFlag,
  suspendedAt,
  bzpCount,
  bzpRecent = [],
  apify = null,
}: Props) {
  const filing = freshnessBadge(lastFilingDate)
  const flags: { label: string; show: boolean }[] = [
    { label: '🔴 Upadłość', show: bankruptcyFlag },
    { label: '🔴 Likwidacja', show: liquidationFlag },
    { label: '🟠 Restrukturyzacja', show: restructuringFlag },
    { label: '🟠 Zawieszona działalność', show: suspendedAt !== null },
  ]
  const hasRedFlags = flags.some((f) => f.show)
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[#888]">Sprawozdanie KRS:</span>
        <span className={`rounded px-2 py-0.5 text-[12px] font-medium ${filing.cls}`}>
          {filing.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[#888]">Status prawny:</span>
        {hasRedFlags ? (
          flags
            .filter((f) => f.show)
            .map((f) => (
              <span
                key={f.label}
                className="rounded bg-[#FEE2E2] px-2 py-0.5 text-[12px] font-medium text-[#991B1B]"
              >
                {f.label}
              </span>
            ))
        ) : (
          <span className="rounded bg-[#DCFCE7] px-2 py-0.5 text-[12px] font-medium text-[#15803D]">
            ✓ Aktywna, brak red flags
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[#888]">Przetargi BZP:</span>
        <span className="rounded bg-[#F5F5F5] px-2 py-0.5 text-[12px] text-[#555]">
          {bzpCount > 0
            ? `${bzpCount} wygranych`
            : 'Brak wygranych — typowe dla małych firm detalicznych'}
        </span>
      </div>

      {/* Last 3 BZP tenders details — Sprint S6B-UI-A */}
      {bzpRecent.length > 0 && (
        <ul className="ml-4 list-disc space-y-0.5 text-[11px] text-[#666]">
          {bzpRecent.slice(0, 3).map((t, i) => (
            <li key={i}>
              {t.award_date ? new Date(t.award_date).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }) : '—'}
              {' · '}
              <span className="font-medium">{t.ordering_party ?? 'Nieznany zamawiający'}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Apify Google Maps card — Sprint S6B-UI-A.
          contact_enrichment.source='apify_gmaps' з Phase B STEP 5.
          Sprint TYDZIEN1.A.2.7 (27.05.2026) — status='skipped' (env-disabled OR
          b2b_bad_fit) OR status='error' (timeout, billing, network) → render
          neutral "tymczasowo wyłączone" zamiast głośnego "Apify: error". Apify
          GMaps is temporarily off pending async polling pattern (sprint A.4). */}
      {apify && (apify.status === 'success' || apify.status === 'partial') && (
        <div className="rounded border border-[#E5E1D8] bg-white p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#888]">
            <span>📍</span>
            <span>Google Maps</span>
          </div>
          <div className="space-y-1.5 text-[12px]">
            {apify.gmaps_rating !== null && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-amber-600">{renderStars(apify.gmaps_rating)}</span>
                <span className="font-medium">{apify.gmaps_rating.toFixed(1)} / 5</span>
                {apify.gmaps_reviews_count !== null && (
                  <span className="text-[#666]">({apify.gmaps_reviews_count} opinii)</span>
                )}
              </div>
            )}
            {apify.phone && (
              <div className="text-[#555]">
                📞 <span className="font-mono">{apify.phone}</span>
              </div>
            )}
            {apify.gmaps_url && (
              <a
                href={apify.gmaps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-[#4F46E5] hover:underline"
              >
                Otwórz w Google Maps ↗
              </a>
            )}
          </div>
        </div>
      )}
      {apify && apify.status === 'no_match' && (
        <div className="rounded border border-[#E5E1D8] bg-white p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#888]">
            <span>📍</span>
            <span>Google Maps</span>
          </div>
          <div className="text-[12px] text-[#888]">Nie znaleziono w Google Maps</div>
        </div>
      )}
      {apify && (apify.status === 'skipped' || apify.status === 'error') && (
        <div className="rounded border border-[#E5E1D8] bg-[#FAFAF7] p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#888]">
            <span>📍</span>
            <span>Google Maps</span>
          </div>
          <div className="text-[12px] text-[#888] italic">
            Tymczasowo wyłączone (w przygotowaniu)
          </div>
        </div>
      )}
    </div>
  )
}
