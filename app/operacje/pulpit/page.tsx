// app/(operacje)/pulpit/page.tsx
// Phase 1 Krok 1/5 — placeholder pulpit для (operacje) workspace.
// Real implementation у Phase 2 (operacyjka dnia: zamówienia today,
// dostawy due, faktury до wystawienia, kanban dnia).

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { ClockIcon, ConstructionIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function OperacjePulpitPage() {
  return (
    <div className="flex flex-col bg-[#FAFAF7] min-h-screen">
      <PageHeader
        title="Pulpit operacyjny"
        breadcrumbs={[{ label: 'Operacje' }, { label: 'Pulpit' }]}
      />

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-medium leading-tight">
            Pulpit operacyjny
          </h1>
          <p className="text-[13px] text-[#555]">
            Tu będzie pulpit operacyjny dnia — zamówienia, dostawy, faktury.
          </p>
        </div>

        <Card className="border-l-4 border-l-amber-400 bg-amber-50/30">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-amber-100">
              <ConstructionIcon className="size-5 text-amber-700" />
            </div>
            <CardTitle className="text-base">Phase 1 in progress</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[13px] leading-relaxed text-[#555]">
              Workspace <strong>(operacje)</strong> jest świeżo utworzony.
              Sidebar zawiera 6 placeholder entry points — kolejne kroki
              Phase 1/2 wprowadzą:
            </p>
            <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-[#555]">
              <li className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <span>
                  <strong>Zamówienia</strong> — AI parser intake (email/
                  WhatsApp/foto papierka) + lifecycle Kanban
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <span>
                  <strong>Klienci</strong> — szybki widok operacyjny
                  (kontakty, ceny, ostatnie zamówienia) бez full intelligence panelu
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <span>
                  <strong>Faktury</strong> — lista wystawionych + drafty,
                  KSeF integration
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <span>
                  <strong>Wysyłki</strong> — status w drodze, ETA, kierowcy
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <span>
                  <strong>Kalendarz</strong> — zaplanowane dostawy, terminy
                  faktur, daty graniczne
                </span>
              </li>
            </ul>
            <p className="mt-4 text-[12px] text-[#888]">
              Pełne wykorzystanie po Krok 3 (workspace switcher) i Phase 2
              (real tables + AI intake).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
