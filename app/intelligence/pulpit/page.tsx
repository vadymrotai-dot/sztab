// app/intelligence/pulpit/page.tsx
// Phase 1 Krok 2/5 — placeholder pulpit для (intelligence) workspace.
// Real implementation у post-Krok-4 phase коли existing /intelligence/*
// dashboard pages переселяться до app/intelligence/* tree.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { ClockIcon, ConstructionIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function IntelligencePulpitPage() {
  return (
    <div className="flex flex-col bg-[#FAFAF7] min-h-screen">
      <PageHeader
        title="Pulpit Intelligence"
        breadcrumbs={[{ label: 'Intelligence' }, { label: 'Pulpit' }]}
      />

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-medium leading-tight">
            Pulpit Intelligence
          </h1>
          <p className="text-[13px] text-[#555]">
            Tu będzie pulpit analityczny — prospekti, dopasowania, analizy AI.
          </p>
        </div>

        <Card className="border-l-4 border-l-indigo-400 bg-indigo-50/30">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-indigo-100">
              <ConstructionIcon className="size-5 text-indigo-700" />
            </div>
            <CardTitle className="text-base">Phase 1 in progress</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[13px] leading-relaxed text-[#555]">
              Workspace <strong>(intelligence)</strong> jest świeżo utworzony.
              Sidebar zawiera 6 placeholder entry points — Krok 4 Phase 1
              przeniesie istniejące strony z{' '}
              <code className="rounded bg-indigo-100 px-1 text-[11px] text-indigo-800">
                app/(dashboard)/intelligence/*
              </code>{' '}
              tutaj. Na razie linki nawigują do pustych stron (404) lub
              chwilowo serwują się przez dashboard layout.
            </p>
            <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-[#555]">
              <li className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <span>
                  <strong>Prospekti</strong> — lista CEIDG / KRS prospekti z
                  enrichment status (email, decision_maker_name, KRS overlay)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <span>
                  <strong>Lookup NIP</strong> — 6-source enrichment per-NIP
                  (CEIDG / GUS / VAT / KRS / BZP / Apify) z business profile AI
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <span>
                  <strong>Discovery</strong> — AI bulk discovery mode A/B/C
                  (existing / registry sweep / combined)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <span>
                  <strong>Dopasowania</strong> — TOP-100 client × product
                  matches z combined_score + AI re-score
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <span>
                  <strong>Analizy</strong> — historia analiz AI per client /
                  product / market / strategy entity
                </span>
              </li>
            </ul>
            <p className="mt-4 text-[12px] text-[#888]">
              Pełne wykorzystanie po Krok 3 (workspace switcher) i Krok 4
              (move existing pages do app/intelligence/*).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
