// app/staff/onboard/page.tsx — po zalogowaniu magic-linkiem:
//   brak konta  → formularz "poproś o dostęp"
//   pending     → ekran oczekiwania
//   rejected    → info
//   approved    → refreshSession (bez relogowania) → dashboard
// Mirror /portal/onboard, ale dla staff_members.

import { redirect } from 'next/navigation'
import { getStaffUser, getStaffAccount } from '@/lib/staff/session'
import { RequestForm } from './request-form'
import { ApprovedRedirect } from './approved-redirect'

export const dynamic = 'force-dynamic'

export default async function StaffOnboardPage() {
  const user = await getStaffUser()
  if (!user) redirect('/staff/login')

  const acc = await getStaffAccount(user.id)

  if (!acc) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-[#1F3A5F]">DAGOLD</div>
          <div className="text-sm text-slate-500">Rejestracja pracownika</div>
        </div>
        <RequestForm email={user.email ?? ''} />
      </div>
    )
  }

  // Zatwierdzony ale JWT jeszcze bez role='staff' (lag) → odśwież sesję i wejdź.
  if (acc.status === 'approved') {
    return <ApprovedRedirect />
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <div className="mb-2 text-2xl font-bold text-[#1F3A5F]">DAGOLD</div>
      {acc.status === 'rejected' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          Twoje zgłoszenie zostało odrzucone. Skontaktuj się z Vadymem, jeśli to
          pomyłka.
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Dziękujemy! Twoje konto pracownika oczekuje na <b>ręczne
          zatwierdzenie</b>. Damy znać, gdy dostęp będzie gotowy.
        </div>
      )}
    </div>
  )
}
