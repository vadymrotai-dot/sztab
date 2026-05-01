// app/(dashboard)/habits/page.tsx
// Sprint S5B-4 — legacy wrapper redirected до /organizer (Nawyki tab
// renderuje HabitsContent). Pozostawione dla potencjalnych bookmarks;
// usuń w Sprint S5C+ jeśli telemetria pokaże 0 hits.

import { redirect } from 'next/navigation'

export default function HabitsRedirect() {
  redirect('/organizer')
}
