// app/(dashboard)/tasks/page.tsx
// Sprint S5B-4 — legacy wrapper redirected до /organizer (Zadania tab
// renderuje TasksContent). Pozostawione dla potencjalnych bookmarks +
// dashboard-content.tsx /tasks?focus=… link (focus param obecnie nie
// honored przez TasksContent — dead deep-link feature). Usuń w S5C+
// jeśli telemetria pokaże 0 hits.

import { redirect } from 'next/navigation'

export default function TasksRedirect() {
  redirect('/organizer')
}
