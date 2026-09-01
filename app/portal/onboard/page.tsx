// app/portal/onboard/page.tsx — Portal klienta Faza 0.
// Po zalogowaniu magic-linkiem: brak konta → formularz NIP; pending → ekran
// oczekiwania; approved → redirect do zamówienia; rejected → info.

import { redirect } from 'next/navigation'
import { getPortalUser, getPortalAccount } from '@/lib/portal/session'
import { NipForm } from './nip-form'

export const dynamic = 'force-dynamic'

export default async function OnboardPage() {
  const user = await getPortalUser()
  if (!user) redirect('/portal/login')

  const acc = await getPortalAccount(user.id)

  if (!acc) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-[#1F3A5F]">DAGOLD</div>
          <div className="text-sm text-slate-500">Rejestracja konta</div>
        </div>
        <NipForm email={user.email ?? ''} />
      </div>
    )
  }

  if (acc.status === 'approved' && acc.client_id) redirect('/portal/zamowienie')

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <div className="mb-2 text-2xl font-bold text-[#1F3A5F]">DAGOLD</div>
      {acc.status === 'rejected' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          Twoje zgłoszenie zostało odrzucone. Skontaktuj się z nami:
          vasin@dagold.com
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Dziękujemy! Twoje konto oczekuje na <b>ręczne zatwierdzenie</b> przez
          zespół DAGOLD. Damy znać e-mailem, gdy dostęp będzie gotowy.
        </div>
      )}
    </div>
  )
}
