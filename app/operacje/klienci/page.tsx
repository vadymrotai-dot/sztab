// app/operacje/klienci/page.tsx
// Phase 2 Krok 1.C2 (08.05.2026) — sidebar 404 fix.
// Sidebar entry "Klienci" link до '/operacje/klienci' але page живе у
// app/(dashboard)/clients/. Phase 1 Krok 5 atomic move ще не зроблений.
// Це cosmetic redirect — Vadym Q1=C decision (defer real move до окремого sprint).

import { redirect } from 'next/navigation'

export default function OperacjeKlienciRedirect(): never {
  redirect('/clients')
}
